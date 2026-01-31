#!/bin/bash

# 编译安装VSCode扩展脚本
echo "开始编译和安装WMF Viewer扩展..."

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 请先安装Node.js"
    exit 1
fi

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "错误: 请先安装npm"
    exit 1
fi

# 检查VSCode是否安装
if ! command -v code &> /dev/null; then
    echo "错误: 请先安装VSCode"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi

# 编译TypeScript代码
echo "编译TypeScript代码..."
npm run compile
if [ $? -ne 0 ]; then
    echo "错误: 代码编译失败"
    exit 1
fi

# 打包扩展
echo "打包扩展..."
npm run package -- --out wmf-viewer.vsix
if [ $? -ne 0 ]; then
    echo "错误: 扩展打包失败"
    exit 1
fi

# 安装扩展到VSCode
echo "安装扩展到VSCode..."
code --install-extension wmf-viewer.vsix
if [ $? -ne 0 ]; then
    echo "错误: 扩展安装失败"
    exit 1
fi

echo "扩展安装成功!"
echo "请重启VSCode以使用WMF Viewer扩展"
