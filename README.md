# 校园拾光固定入口

固定入口：https://shanye-not-found.github.io/campus-survey-entry/

纯静态 HTML / CSS / JavaScript，无生产依赖。入口只提供最新地址和跳转，实际问卷系统继续运行在本机。访问者仍须位于可互访的网络；入口无法绕过校园网隔离。

## 分支与发布

- `main`：源码、脚本、测试；GitHub Pages 使用 `/docs`，强制 HTTPS。
- `status`：独立的 `address.json`。网页直接通过公开 Contents API 读取，带禁用缓存参数；地址更新不触发 Pages 重建。
- 不上传问卷、照片、学生信息、主机名、MAC、凭证。地址记录及其历史是公开的。

地址格式：`schema_version: 1`，`state: started | stopped | unavailable`，UTC `updated_at`，`addresses: [{label, url}]`。只接受私有 IPv4 和 5173 端口。

## 本机使用

本文件夹与 `proj` 平级。现有桌面“启动校园拾光.cmd”会在服务就绪后上报地址；“停止校园拾光.bat”会在关闭服务后上报停止。无需打开此文件夹手动操作。

启动/停止集成位置：`proj/scripts/update-entry.ps1`。本机配置保存在 `proj/.runtime/entry-publisher.json`，仅记录发布脚本位置。

手动更新或排错：

```powershell
.\scripts\publish-address.ps1 -ProjectRoot '..\proj' -State started
.\scripts\publish-address.ps1 -ProjectRoot '..\proj' -State stopped
# 只检查将要发布的数据，不写入 GitHub
.\scripts\publish-address.ps1 -ProjectRoot '..\proj' -State started -DryRun
```

使用本机已有 Git Credential Manager 中的 GitHub 凭证，不在磁盘或页面保存 token。发布脚本需有该仓库写权限。网络/认证失败会保留原记录并提示，不阻止本机启动或停止；本机日志为 `proj/.runtime/entry-publish.log`。

电脑意外关机、睡眠或网卡在服务运行中变化时，不会自动上报；重新双击启动器即可刷新。页面显示最后上报时间，不检测本机实时状态。GitHub 请求失败/限流/超时可通过刷新按钮重试。

## 开发验证

```powershell
npm ci
npm run check
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/publisher.ps1
# 实际已发布页面和局域网服务均可用时
$env:ENTRY_LIVE='1'; npm test
```

本地预览：`npm run dev`，只监听 `127.0.0.1:5180`。浏览器测试包含成功、地址变更、停止、复制、非法地址、失败恢复、超时和手机布局。
