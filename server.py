# -*- coding: utf-8 -*-
"""歌斯拉 v2 · 分享服务器
把 dist 目录当静态文件，同时启动 SSH 隧道 + 分享 API"""

import os, re, subprocess, threading, time, io, random, string
from flask import Flask, jsonify, send_file, request
import qrcode

app = Flask(__name__, static_folder='dist', static_url_path='')

@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Cache-Control'] = 'no-store'
    return resp

# ============================================================
# SSH 隧道
# ============================================================
tunnel_url = None
song_shares = {}

def make_song_share_id():
    suffix = ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"{int(time.time() * 1000):x}{suffix}"

def build_song_share_url(sid):
    base = (tunnel_url or 'http://localhost:5000').rstrip('/')
    return f"{base}/#/s?sid={sid}"

def start_tunnel():
    global tunnel_url
    while True:
        try:
            proc = subprocess.Popen(
                ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10',
                 '-R', '80:localhost:5000', 'nokey@localhost.run'],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
            for line in proc.stdout:
                m = re.search(r'https://[a-z0-9]+\.lhr\.life', line)
                if m:
                    tunnel_url = m.group()
                    print(f"\n  >>> 分享链接: {tunnel_url}\n")
                    break
            proc.wait()
        except Exception as e:
            print(f"Tunnel error: {e}")
        time.sleep(5)

threading.Thread(target=start_tunnel, daemon=True).start()

# ============================================================
# 路由
# ============================================================
@app.route('/')
def index():
    return send_file('dist/index.html')

@app.route('/api/share')
def api_share():
    if tunnel_url:
        return jsonify({"url": tunnel_url, "ready": True})
    return jsonify({"url": None, "ready": False, "message": "链接生成中..."})

@app.route('/api/qrcode')
def api_qrcode():
    url = request.args.get('url', tunnel_url or '')
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

@app.route('/api/song-share', methods=['POST', 'OPTIONS'])
def api_song_share_create():
    if request.method == 'OPTIONS':
        return ('', 204)
    data = request.get_json(silent=True) or {}
    token = str(data.get('token') or '').strip()
    if not token:
        return jsonify({"error": "Missing token"}), 400
    sid = make_song_share_id()
    song_shares[sid] = {"token": token, "createdAt": int(time.time() * 1000)}
    return jsonify({
        "ready": bool(tunnel_url),
        "id": sid,
        "url": build_song_share_url(sid),
        "message": "歌曲短分享链接已生成" if tunnel_url else "已生成本机短链接，公网链接仍在生成中..."
    })

@app.route('/api/song-share/<sid>')
def api_song_share_get(sid):
    record = song_shares.get(sid)
    if not record:
        return jsonify({"error": "Song share not found"}), 404
    return jsonify(record)

# ============================================================
# 启动
# ============================================================
if __name__ == '__main__':
    print("\n  歌斯拉 v2 · 分享服务器")
    print(f"  http://127.0.0.1:5000\n")
    app.run(debug=False, port=5000, use_reloader=False)