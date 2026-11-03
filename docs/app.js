"use strict";

// 地址走独立分支，通过 Contents API 直接读取，避免等待 Pages 重新发布。
const addressApi = "https://api.github.com/repos/shanye-not-found/campus-survey-entry/contents/address.json";
const statusElement = document.querySelector("#status");
const updatedElement = document.querySelector("#updated");
const addressList = document.querySelector("#addresses");
const refreshButton = document.querySelector("#refresh");
const feedback = document.querySelector("#feedback");

function validateRecord(value) {
  if (!value || value.schema_version !== 1 || !["started", "stopped", "unavailable"].includes(value.state)
      || !Number.isFinite(Date.parse(value.updated_at)) || !Array.isArray(value.addresses) || value.addresses.length > 16) {
    throw new Error("地址记录格式不正确，请联系服务电脑的使用者。");
  }
  const addresses = value.addresses.map((entry) => {
    // 只允许本项目端口和私有 IPv4，避免远端记录变成任意跳转。
    const match = typeof entry?.url === "string" && /^http:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):5173\/?$/.exec(entry.url);
    const parts = match ? match[1].split(".").map(Number) : [];
    const privateIp = parts.length === 4 && parts.every((part) => part >= 0 && part <= 255)
      && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
    if (!privateIp) throw new Error("地址记录包含不受支持的地址，请联系服务电脑的使用者。");
    return { url: new URL(entry.url).origin, label: typeof entry.label === "string" ? entry.label.slice(0, 80) : "局域网" };
  });
  if (value.state === "started" && addresses.length === 0) throw new Error("启动记录缺少局域网地址，请重新运行桌面启动器。");
  return { ...value, addresses };
}

async function copyAddress(url, input) {
  try {
    await navigator.clipboard.writeText(url);
    feedback.textContent = "链接已复制。";
  } catch {
    input.focus();
    input.select();
    feedback.textContent = "无法自动复制，已选中链接，请手动复制。";
  }
}

function renderRecord(record) {
  const timestamp = new Date(record.updated_at);
  updatedElement.textContent = `最后上报：${timestamp.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`;
  updatedElement.hidden = false;
  const states = { started: "启动器最近报告：服务已启动。", stopped: "停止器最近报告：服务已停止。请在服务电脑双击启动器。", unavailable: "最近未找到可用的局域网地址，请在服务电脑连接 Wi-Fi 后重新运行启动器。" };
  statusElement.textContent = states[record.state];
  if (Date.now() - timestamp.getTime() > 24 * 60 * 60 * 1000) {
    statusElement.textContent += " 此记录已超过 24 小时，请确认服务仍在运行。";
  }
  if (record.state !== "started") return;
  for (const address of record.addresses) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = address.label;
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = `${address.url}/review`;
    input.setAttribute("aria-label", `${address.label} 审阅链接`);
    // 顶层导航到 HTTP 局域网页面，不跨域请求本地 API。
    const link = document.createElement("a");
    link.className = "entry-link";
    link.href = input.value;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "进入审阅";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制链接";
    copy.addEventListener("click", () => copyAddress(input.value, input));
    item.append(label, input, link, copy);
    addressList.append(item);
  }
}

async function refreshAddress() {
  refreshButton.disabled = true;
  statusElement.dataset.error = "false";
  statusElement.textContent = "正在读取最新地址…";
  addressList.replaceChildren();
  updatedElement.hidden = true;
  feedback.textContent = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${addressApi}?ref=status&t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github.raw+json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error("GitHub 暂时限制了请求，请稍后再刷新。");
      throw new Error(`读取地址失败（${response.status}），请稍后刷新。`);
    }
    renderRecord(validateRecord(await response.json()));
  } catch (error) {
    statusElement.dataset.error = "true";
    statusElement.textContent = error.name === "AbortError" ? "读取超时，请检查网络后刷新。" : error instanceof TypeError ? "无法连接 GitHub，请检查网络后刷新。" : error.message;
  } finally {
    clearTimeout(timeout);
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", refreshAddress);
refreshAddress();
