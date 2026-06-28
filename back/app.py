import os
import random
from flask import Flask, jsonify, render_template, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Tu directorio multimedia externo
MEDIA_FOLDER = "C:/Users/Marcu/Downloads/"

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.ico', '.webp'}
VIDEO_EXTS = {'.mp4', '.avi', '.mov', '.webm', '.mkv', '.wmv', '.flv', '.heic'}


# Obtener archivos válidos e inicializar la lista mezclada
def get_media_files(folder):
    if not os.path.exists(folder):
        return []
    return [f for f in os.listdir(folder) if os.path.splitext(f)[1].lower() in IMAGE_EXTS.union(VIDEO_EXTS)]


playlist = get_media_files(MEDIA_FOLDER)
random.shuffle(playlist)
current_index = 0


@app.route('/')
def index():
    return render_template('index.html')


# Nueva ruta para renderizar la página del reproductor
@app.route('/random')
def random_player():
    return render_template('random.html')


# Endpoint para servir los archivos físicos del disco al navegador
@app.route('/media/<path:filename>')
def serve_media(filename):
    return send_from_directory(MEDIA_FOLDER, filename)


# Endpoint que solicita el JS para saber cuál es el siguiente archivo
@app.route('/api/next', methods=['GET'])
def get_next_media():
    global current_index, playlist

    if not playlist:
        return jsonify({"error": "No se encontraron archivos"}), 404

    if current_index >= len(playlist):
        random.shuffle(playlist)
        current_index = 0

    filename = playlist[current_index]
    _, ext = os.path.splitext(filename.lower())
    media_type = "image" if ext in IMAGE_EXTS else "video"

    data = {
        "url": f"/media/{filename}",
        "filename": filename,
        "type": media_type,
        "index": current_index + 1,
        "total": len(playlist)
    }

    current_index += 1
    return jsonify(data)


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "total_files": len(playlist)}), 200


if __name__ == '__main__':
    app.run(debug=True, port=5000)