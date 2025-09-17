import os
from pathlib import Path
import streamlit as st

st.set_page_config(page_title="Mr Box", layout="wide")

root = Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
css_path = root / "styles.css"
js_path = root / "game.js"

css = f"<style>{css_path.read_text(encoding='utf-8')}</style>"
js = f"<script>{js_path.read_text(encoding='utf-8')}</script>"

# Replace relative asset links with inline to avoid static path issues
html = html.replace('<link rel="stylesheet" href="./styles.css" />', css)
html = html.replace('<script src="./game.js"></script>', js)

# Audio handling: prefer env URL; fallback to GitHub raw as example
audio_url = os.getenv(
    "MRBOX_AUDIO_URL",
    "https://raw.githubusercontent.com/lynnyolanda22-code/game/main/two_tigers.mp3",
)
html = html.replace('src="./two_tigers.mp3"', f'src="{audio_url}"')

st.markdown("## Mr Box")
st.components.v1.html(html, height=720, scrolling=False)

