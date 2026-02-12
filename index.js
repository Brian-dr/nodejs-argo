const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const FILE_PATH = '/tmp'; 

const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 8080; 
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
}

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

function deleteNodes() {
  try {
    if (!UPLOAD_URL || !fs.existsSync(subPath)) return;
    let fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    // --- 修正后的正则表达式 ---
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );
    if (nodes.length === 0) return;
    axios.post(`${UPLOAD_URL}/api/delete-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch (err) {}
}

function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) { fs.unlinkSync(filePath); }
      } catch (err) {}
    });
  } catch (err) {}
}

app.get("/", (req, res) => res.send("Argo Tunnel is active."));

async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

function downloadFile(fileName, fileUrl, callback) {
  const writer = fs.createWriteStream(fileName);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        console.log(`Download ${path.basename(fileName)} successfully`);
        callback(null, fileName);
      });
      writer.on('error', err => callback(err.message));
    })
    .catch(err => callback(err.message));
}

async function downloadFilesAndRun() {  
  const arch = getSystemArchitecture();
  const filesToDownload = (arch === 'arm') ? 
    [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }] :
    [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }];

  if (NEZHA_SERVER && NEZHA_KEY) {
    const url = (arch === 'arm') ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent";
    filesToDownload.unshift({ fileName: NEZHA_PORT ? npmPath : phpPath, fileUrl: url });
  }

  const downloadPromises = filesToDownload.map(f => new Promise((res, rej) => downloadFile(f.fileName, f.fileUrl, (e, p) => e ? rej(e) : res(p))));
  try { await Promise.all(downloadPromises); } catch (err) { return; }

  filesToDownload.forEach(f => { if (fs.existsSync(f.fileName)) fs.chmodSync(f.fileName, 0o775); });

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const configYaml = `client_secret: ${NEZHA_KEY}\nserver: ${NEZHA_SERVER}\ntls: true\nuuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
    } else {
      exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} --disable-auto-update >/dev/null 2>&1 &`);
    }
  }

  exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);

  if (fs.existsSync(botPath)) {
    let args = ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/) ? 
      `tunnel --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}` : 
      `tunnel --no-autoupdate --protocol http2 --logfile ${bootLogPath} --url http://localhost:${ARGO_PORT}`;
    exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
  }
}

async function generateLinks(argoDomain) {
  const nodeName = NAME || 'Argo-Node';
  const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain };
  const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}\n\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}`;
  
  fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
  app.get(`/${SUB_PATH}`, (req, res) => res.send(Buffer.from(subTxt).toString('base64')));
}

async function startserver() {
  try {
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    if (ARGO_AUTH && ARGO_DOMAIN) { await generateLinks(ARGO_DOMAIN); }
  } catch (error) { console.error(error); }
}

startserver();
app.listen(PORT, () => console.log(`Server is running on port:${PORT}`));
