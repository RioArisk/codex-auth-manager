#!/usr/bin/env python3
"""
生成 Codex Manager 应用图标
使用绿色主题色，简洁的代码风格设计
"""

from PIL import Image, ImageDraw, ImageFont
import os
import struct
import io

# 主题色
ACCENT_COLOR = (16, 185, 129)  # #10B981 emerald-500
BG_COLOR = (45, 45, 45)  # #2D2D2D
DARK_BG = (31, 31, 31)  # #1F1F1F

def create_icon(size):
    """创建指定尺寸的图标"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 圆角矩形背景
    padding = size // 8
    corner_radius = size // 5
    
    # 绘制圆角矩形背景
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=corner_radius,
        fill=BG_COLOR
    )
    
    # 绘制代码括号 { }
    bracket_color = ACCENT_COLOR
    stroke_width = max(2, size // 20)
    
    # 左括号 {
    left_x = size * 0.28
    center_y = size // 2
    bracket_height = size * 0.4
    bracket_width = size * 0.12
    
    # 左括号上半部分
    draw.arc(
        [left_x - bracket_width, center_y - bracket_height, left_x + bracket_width, center_y],
        start=270, end=0,
        fill=bracket_color, width=stroke_width
    )
    # 左括号下半部分
    draw.arc(
        [left_x - bracket_width, center_y, left_x + bracket_width, center_y + bracket_height],
        start=0, end=90,
        fill=bracket_color, width=stroke_width
    )
    
    # 右括号 }
    right_x = size * 0.72
    
    # 右括号上半部分
    draw.arc(
        [right_x - bracket_width, center_y - bracket_height, right_x + bracket_width, center_y],
        start=180, end=270,
        fill=bracket_color, width=stroke_width
    )
    # 右括号下半部分
    draw.arc(
        [right_x - bracket_width, center_y, right_x + bracket_width, center_y + bracket_height],
        start=90, end=180,
        fill=bracket_color, width=stroke_width
    )
    
    # 中间的点或横线
    line_y = center_y
    line_length = size * 0.15
    draw.line(
        [(size // 2 - line_length, line_y), (size // 2 + line_length, line_y)],
        fill=bracket_color, width=stroke_width
    )
    
    return img

def create_simple_icon(size):
    """创建简单版本的图标（用于小尺寸）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 圆角矩形背景
    padding = max(1, size // 10)
    corner_radius = max(2, size // 6)
    
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=corner_radius,
        fill=BG_COLOR
    )
    
    # 简单的代码符号 <>
    symbol_color = ACCENT_COLOR
    stroke_width = max(1, size // 12)
    
    center_x = size // 2
    center_y = size // 2
    symbol_size = size * 0.25
    
    # < 符号
    draw.line([
        (center_x - symbol_size * 0.3, center_y),
        (center_x - symbol_size, center_y - symbol_size * 0.5)
    ], fill=symbol_color, width=stroke_width)
    draw.line([
        (center_x - symbol_size * 0.3, center_y),
        (center_x - symbol_size, center_y + symbol_size * 0.5)
    ], fill=symbol_color, width=stroke_width)
    
    # > 符号
    draw.line([
        (center_x + symbol_size * 0.3, center_y),
        (center_x + symbol_size, center_y - symbol_size * 0.5)
    ], fill=symbol_color, width=stroke_width)
    draw.line([
        (center_x + symbol_size * 0.3, center_y),
        (center_x + symbol_size, center_y + symbol_size * 0.5)
    ], fill=symbol_color, width=stroke_width)
    
    return img

def create_ico(images, output_path):
    """创建 ICO 文件"""
    # ICO 文件头
    ico_data = io.BytesIO()
    
    # 准备所有图像数据
    image_data = []
    for img in images:
        png_data = io.BytesIO()
        img.save(png_data, format='PNG')
        image_data.append(png_data.getvalue())
    
    # 写入 ICO 头
    ico_data.write(struct.pack('<HHH', 0, 1, len(images)))  # Reserved, Type (1=ICO), Count
    
    # 计算偏移量
    offset = 6 + 16 * len(images)  # 头部 + 目录条目
    
    # 写入目录条目
    for i, img in enumerate(images):
        width = img.width if img.width < 256 else 0
        height = img.height if img.height < 256 else 0
        ico_data.write(struct.pack('<BBBBHHII',
            width,      # Width
            height,     # Height
            0,          # Color palette
            0,          # Reserved
            1,          # Color planes
            32,         # Bits per pixel
            len(image_data[i]),  # Size of image data
            offset      # Offset to image data
        ))
        offset += len(image_data[i])
    
    # 写入图像数据
    for data in image_data:
        ico_data.write(data)
    
    # 保存文件
    with open(output_path, 'wb') as f:
        f.write(ico_data.getvalue())

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 定义需要生成的尺寸
    sizes = {
        '32x32.png': 32,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'icon.png': 512,
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }
    
    print("生成图标中...")
    
    # 生成 PNG 图标
    for filename, size in sizes.items():
        filepath = os.path.join(script_dir, filename)
        if size < 64:
            img = create_simple_icon(size)
        else:
            img = create_icon(size)
        img.save(filepath, 'PNG')
        print(f"  [OK] {filename}")
    
    # 生成 ICO 文件（包含多种尺寸）
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = []
    for size in ico_sizes:
        if size < 64:
            ico_images.append(create_simple_icon(size))
        else:
            ico_images.append(create_icon(size))
    
    ico_path = os.path.join(script_dir, 'icon.ico')
    create_ico(ico_images, ico_path)
    print(f"  [OK] icon.ico")
    
    # 生成 ICNS 文件（macOS）- 简单复制一个大尺寸 PNG
    # 注意：真正的 ICNS 需要特殊工具，这里只是占位
    icns_source = os.path.join(script_dir, 'icon.png')
    icns_path = os.path.join(script_dir, 'icon.icns')
    # 对于 macOS，保留原有的 icns 或复制 png
    
    print("\n图标生成完成！")

if __name__ == '__main__':
    main()
