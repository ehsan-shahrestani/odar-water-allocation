import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_PATH = os.path.join(BASE_DIR, 'projects/client/public/icons/icon-512x512.png')
RES_DIR = os.path.join(BASE_DIR, 'android/app/src/main/res')

BG_COLOR = (7, 72, 45) # #07482d

def generate_assets():
    if not os.path.exists(ICON_PATH):
        print(f"Error: {ICON_PATH} not found.")
        return

    icon = Image.open(ICON_PATH).convert('RGBA')

    # 1. Launcher Icons
    icon_sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }

    for folder, size in icon_sizes.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        
        # Standard & Round
        resized = icon.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(out_dir, 'ic_launcher.png'))
        resized.save(os.path.join(out_dir, 'ic_launcher_round.png'))

        # Foreground for adaptive icon (canvas size = size * 108/48)
        canvas_size = int(size * 108 / 48)
        fg_canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        # icon size inside canvas ~ 65%
        inner_size = int(canvas_size * 0.65)
        inner_icon = icon.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        offset = ((canvas_size - inner_size) // 2, (canvas_size - inner_size) // 2)
        fg_canvas.paste(inner_icon, offset, inner_icon)
        fg_canvas.save(os.path.join(out_dir, 'ic_launcher_foreground.png'))

    # 2. Splash Screens
    splash_sizes = {
        'drawable': (480, 320),
        'drawable-port-mdpi': (320, 480),
        'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
        'drawable-land-mdpi': (480, 320),
        'drawable-land-hdpi': (800, 480),
        'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960),
        'drawable-land-xxxhdpi': (1920, 1280),
    }

    for folder, (w, h) in splash_sizes.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)

        splash_bg = Image.new('RGBA', (w, h), BG_COLOR + (255,))
        # logo in the center (about 35% of the smaller dimension)
        min_dim = min(w, h)
        logo_size = int(min_dim * 0.38)
        if logo_size > 0:
            splash_logo = icon.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
            offset = ((w - logo_size) // 2, (h - logo_size) // 2)
            splash_bg.paste(splash_logo, offset, splash_logo)

        splash_bg.save(os.path.join(out_dir, 'splash.png'))

    print("Android launcher icons and splash screens generated successfully!")

if __name__ == '__main__':
    generate_assets()
