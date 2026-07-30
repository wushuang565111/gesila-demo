# 歌斯拉 Demo 工具运行说明

## 本地运行

1. 安装 Node.js 18 或更高版本。
2. 在项目目录执行：

```bash
npm install
npm run dev
```

3. 浏览器打开终端提示的本地地址，通常是：

```text
http://localhost:5173/
```

## 预览构建产物

项目已包含 `dist` 目录。如需用 Vite 预览构建产物：

```bash
npm install
npm run preview -- --host 0.0.0.0 --port 4173
```

浏览器打开：

```text
http://localhost:4173/
```

## AI 接口说明

右上角「AI 设置」中填写接口 Key：

- DeepSeek：用于歌词与灵感词情感捕捉候选生成。
- MiniMax Music：用于完整歌曲生成。

Key 只保存在当前浏览器本地，不会写入代码包。

## 分享给局域网设备

如果另一台设备和本机在同一网络，可以在本机运行：

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

然后让对方访问终端里显示的 Network 地址，例如：

```text
http://你的局域网IP:4173/
```

## 分享给任意设备（公网链接 + 二维码）

页面右上角内置了独立的「🔗 分享页面」悬浮按钮（写在 `dist/index.html` 中，独立于 React 应用）。
点击后会向分享服务请求公网链接并展示二维码，扫码或复制链接即可发给任何设备。

分享服务负责把本机页面通过 SSH 隧道映射到公网地址，二选一启动即可：

### 方式 A：Node 分享服务（默认）

1. 先构建页面：

```bash
npm install
npm run build
```

2. 启动分享服务：

```bash
npm run share
```

3. 浏览器打开：

```text
http://localhost:5000/
```

### 方式 B：Python 分享服务（server.py）

需要 Python 3 环境，并安装依赖：

```bash
pip install flask qrcode
```

启动：

```bash
npm run share:py
# 或
python server.py
```

浏览器打开 `http://localhost:5000/` 即可。

### 使用说明

- 点击右上角「🔗 分享页面」，弹窗会自动获取公网链接并生成二维码。
- 分享按钮会优先连接当前页面所在源的 `/api/share`；若在 `npm run preview`（例如 4173 端口）下打开，也会自动回落连接本机 `http://localhost:5000` 的分享服务。
- 分享服务会自动执行 SSH 隧道，效果类似 `ssh -R 80:localhost:5000 nokey@localhost.run`。
- 电脑需要保持开机，终端里的分享服务不能关闭。
- 免费隧道断开后会自动重连，链接可能变化。
- 如果公司网络限制 SSH，公网链接可能生成失败，可以换网络再试。
