#!/usr/bin/env python3
"""
银发健康助手 - 启动脚本
启动本地HTTP服务器并显示访问地址
"""

import http.server
import socketserver
import os
import sys

def main():
    # 设置端口（尝试多个端口以防占用）
    ports_to_try = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087]
    host = "localhost"
    selected_port = None
    httpd = None
    
    # 尝试绑定端口
    for port in ports_to_try:
        try:
            Handler = http.server.SimpleHTTPRequestHandler
            httpd = socketserver.TCPServer((host, port), Handler)
            selected_port = port
            break
        except OSError as e:
            if e.errno == 48 or e.winerror == 10048:  # Address already in use
                continue
            else:
                raise
    
    if selected_port is None:
        print("❌ 所有端口都被占用，请释放端口后重试")
        sys.exit(1)
    
    # 输出启动信息
    print("=" * 60)
    print("    银发健康助手 - 启动成功")
    print("=" * 60)
    print(f"\n访问地址:")
    print(f"   http://{host}:{selected_port}")
    print(f"   http://127.0.0.1:{selected_port}")
    print(f"\n请在浏览器中打开以上地址开始使用")
    print(f"按 Ctrl+C 停止服务器")
    print("\n" + "=" * 60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 服务器已停止")
        httpd.shutdown()

if __name__ == "__main__":
    # 确保在frontend目录下运行
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
