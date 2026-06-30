import os
import random
from flask import Flask, jsonify, render_template, send_from_directory, request
from flask_cors import CORS
import sqlite3
import math
import cv2



app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
DB_PATH = "back/biblioteca.db"

# Tu directorio multimedia externo
MEDIA_FOLDER = "C:/pers/podo"

AVATAR_CACHE_FOLDER = os.path.join(MEDIA_FOLDER, 'cache_avatars')
os.makedirs(AVATAR_CACHE_FOLDER, exist_ok=True)

playlist_pendientes = []
indice_pendientes = 0
servidor_inicializado = False

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".ico", ".webp"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".webm", ".mkv", ".wmv", ".flv", ".heic"}


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def sincronizar_archivos():
    conn = get_db_connection()
    cursor = conn.cursor()

    archivos_insertados = 0

    for filename in get_media_files(MEDIA_FOLDER):
        filepath = os.path.join(MEDIA_FOLDER, filename)

        _, ext = os.path.splitext(filename)
        tipo = "image" if ext.lower() in IMAGE_EXTS else "video"

        stat = os.stat(filepath)

        cursor.execute(
            """
            INSERT OR IGNORE INTO archivos
            (filename, filepath, tipo, size_bytes)
            VALUES (?, ?, ?, ?)
        """,
            (filename, filepath, tipo, stat.st_size),
        )

        if cursor.rowcount > 0:
            archivos_insertados += 1

    conn.commit()
    conn.close()

    print(f"✔ Sincronización completada. {archivos_insertados} archivos nuevos.")


@app.route("/api/stats/pendientes")
def get_pendientes_count():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Esta consulta busca archivos que falten en cualquiera de las dos tablas intermedias
        query = """
SELECT COUNT(*) as total
FROM archivos a
WHERE NOT EXISTS (
    SELECT 1 FROM archivo_personas ap
    WHERE ap.archivo_id = a.id
)
AND NOT EXISTS (
    SELECT 1 FROM archivo_albumes aa
    WHERE aa.archivo_id = a.id
);
        """

        cursor.execute(query)
        result = cursor.fetchone()
        conn.close()

        total_pendientes = result["total"] if result else 0

        return jsonify({"total_pendientes": total_pendientes})

    except Exception as e:
        print(f"Error en la base de datos: {e}")
        # Si da error porque las tablas no existen todavía, devolvemos 0 temporalmente
        return jsonify({"total_pendientes": 0, "error": str(e)}), 500


# Obtener archivos válidos e inicializar la lista mezclada
def get_media_files(folder):
    if not os.path.exists(folder):
        return []
    return [
        f
        for f in os.listdir(folder)
        if os.path.splitext(f)[1].lower() in IMAGE_EXTS.union(VIDEO_EXTS)
    ]


def cargar_playlist_pendientes():
    """Consulta la BD con la lógica estricta, genera la lista y la baraja una vez"""
    global playlist_pendientes, indice_pendientes
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Tu consulta optimizada: selecciona los datos que el reproductor necesita
        query = """
            SELECT a.id, a.filename, a.filepath 
            FROM archivos a
            WHERE NOT EXISTS (
                SELECT 1 FROM archivo_personas ap
                WHERE ap.archivo_id = a.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM archivo_albumes aa
                WHERE aa.archivo_id = a.id
            );
        """
        cursor.execute(query)
        filas = cursor.fetchall()
        conn.close()

        # Mapeamos los resultados a un formato amigable para el JSON del frontend
        playlist_pendientes = []

        for fila in filas:
            filename = fila["filename"]
            _, ext = os.path.splitext(filename.lower())
            media_type = "image" if ext in IMAGE_EXTS else "video"
            playlist_pendientes.append(
                {
                    "id": fila["id"],
                    "filename": fila["filename"],
                    "type": media_type,
                    # Generamos la URL estática basándonos en la ruta que guardas
                    "url": f"/media/{fila['filename']}",
                }
            )

        # Barajamos las cartas una sola vez al cargar la sesión
        random.shuffle(playlist_pendientes)
        indice_pendientes = 0  # Reseteamos el puntero

    except Exception as e:
        print(f"Error cargando playlist de pendientes: {e}")
        playlist_pendientes = []


playlist = get_media_files(MEDIA_FOLDER)
random.shuffle(playlist)
current_index = 0


@app.route("/")
def index():
    return render_template("index.html")


# Nueva ruta para renderizar la página del reproductor
@app.route("/random")
def random_player():
    return render_template("random.html")


@app.route("/pendientes")
def pendientes_player():
    # Cada vez que el usuario entra o recarga /pendientes, volvemos a calcular
    # la lista real por si el servidor seguía encendido pero ya guardó metadatos antes
    cargar_playlist_pendientes()
    return render_template("pendientes.html")

@app.route("/personas")
def personas():
    return render_template("personas.html")

@app.route("/albumes")
def albumes():
    return render_template("albumes.html")

@app.route("/favoritos")
def favoritos():
    return render_template("favoritos.html")

# Endpoint para servir los archivos físicos del disco al navegador
@app.route("/media/<path:filename>")
def serve_media(filename):
    return send_from_directory(MEDIA_FOLDER, filename)


# Endpoint que solicita el JS para saber cuál es el siguiente archivo
@app.route("/api/next", methods=["GET"])
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
        "total": len(playlist),
    }

    current_index += 1
    return jsonify(data)


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "total_files": len(playlist)}), 200

@app.route


@app.route("/api/pendientes/next")
def get_next_pendiente():
    global playlist_pendientes, indice_pendientes

    # Si la lista está vacía (porque no hay pendientes o hubo un error)
    if not playlist_pendientes:
        return (
            jsonify(
                {
                    "error": "No quedan archivos pendientes",
                    "index": 0,
                    "total": 0,
                    "url": "",
                }
            ),
            200,
        )

    # Si el usuario ha llegado al final de la cola de pendientes, reiniciamos el bucle
    if indice_pendientes >= len(playlist_pendientes):
        indice_pendientes = 0
        # Opcional: Podríamos re-barajar aquí si quieres que cambie el orden en la segunda vuelta
        random.shuffle(playlist_pendientes)

    # Extraemos el elemento actual de la fila
    media_actual = playlist_pendientes[indice_pendientes]

    print(media_actual)

    # Preparamos la respuesta incrementando el índice para la visualización humana (1-based index)
    respuesta = {
        "id": media_actual["id"],
        "type": media_actual["type"],
        "filename": media_actual["filename"],
        "url": media_actual["url"],
        "index": indice_pendientes + 1,
        "total": len(playlist_pendientes),
    }

    # Avanzamos el puntero interno para la siguiente petición del JS
    indice_pendientes += 1

    return jsonify(respuesta)


@app.route("/api/pendientes/guardar", methods=["POST"])
def guardar_metadatos():
    try:
        data = request.get_json()
        archivo_id = data.get("archivo_id")
        tipo = data.get("tipo")  # "albumes" o "personas"
        valores = data.get("valores")  # Lista de strings: ["Gimnasio", "Padre"]

        if not archivo_id or not tipo or not valores:
            return jsonify({"status": "error", "message": "Datos incompletos"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        if tipo == "albumes":
            for nombre_album in valores:
                # Insertamos el álbum. SQLite se encarga del timestamp de 'fecha_creacion' por defecto si está configurado
                cursor.execute(
                    "INSERT OR IGNORE INTO albumes (nombre) VALUES (?)", (nombre_album,)
                )
                cursor.execute(
                    "SELECT id FROM albumes WHERE nombre = ?", (nombre_album,)
                )
                album_id = cursor.fetchone()["id"]

                # Vinculamos en la intermedia
                cursor.execute(
                    "INSERT OR IGNORE INTO archivo_albumes (archivo_id, album_id) VALUES (?, ?)",
                    (archivo_id, album_id),
                )

        elif tipo == "personas":
            for nombre_persona in valores:
                # Insertamos la persona (también gestiona su fecha_creacion automáticamente)
                cursor.execute(
                    "INSERT OR IGNORE INTO personas (nombre) VALUES (?)",
                    (nombre_persona,),
                )
                cursor.execute(
                    "SELECT id FROM personas WHERE nombre = ?", (nombre_persona,)
                )
                persona_id = cursor.fetchone()["id"]

                # Vinculamos en la intermedia
                cursor.execute(
                    "INSERT OR IGNORE INTO archivo_personas (archivo_id, persona_id) VALUES (?, ?)",
                    (archivo_id, persona_id),
                )

        conn.commit()
        conn.close()
        return jsonify(
            {"status": "success", "message": "Metadatos guardados correctamente."}
        )

    except Exception as e:
        print(f"Error al guardar metadatos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# 2. ENDPOINT PARA FAVORITOS (Ahora es un INSERT en su propia tabla relacional)
@app.route("/api/pendientes/favorito", methods=["POST"])
def marcar_favorito():
    try:
        data = request.get_json()
        archivo_id = data.get("archivo_id")

        if not archivo_id:
            return (
                jsonify({"status": "error", "message": "Falta el ID del archivo"}),
                400,
            )

        conn = get_db_connection()
        cursor = conn.cursor()

        # Al ser una tabla aparte, hacemos un INSERT.
        # Si la tabla tiene (archivo_id, fecha), la fecha se rellena sola si usas DEFAULT CURRENT_TIMESTAMP
        cursor.execute(
            "INSERT OR IGNORE INTO favoritos (archivo_id) VALUES (?)", (archivo_id,)
        )

        conn.commit()
        conn.close()
        return jsonify(
            {"status": "success", "message": "Añadido a la tabla de favoritos"}
        )

    except Exception as e:
        print(f"Error en favoritos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/albumes")
def get_all_albumes():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT nombre FROM albumes ORDER BY nombre ASC;")
        filas = cursor.fetchall()
        conn.close()

        # Extraemos solo el campo 'nombre' en una lista limpia de strings
        lista = [fila["nombre"] for fila in filas]
        return jsonify(lista)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/personas")
def get_all_personas():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT nombre FROM personas ORDER BY nombre ASC;")
        filas = cursor.fetchall()
        conn.close()

        lista = [fila["nombre"] for fila in filas]
        return jsonify(lista)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pendientes/actuales")
def get_metadatos_actuales():
    try:
        archivo_id = request.args.get("archivo_id")
        tipo = request.args.get("tipo")  # "albumes" o "personas"

        if not archivo_id or not tipo:
            return jsonify([]), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        if tipo == "albumes":
            query = """
                SELECT nom.nombre 
                FROM albumes nom
                JOIN archivo_albumes inter ON nom.id = inter.album_id
                WHERE inter.archivo_id = ?;
            """
        else:
            query = """
                SELECT nom.nombre 
                FROM personas nom
                JOIN archivo_personas inter ON nom.id = inter.persona_id
                WHERE inter.archivo_id = ?;
            """

        cursor.execute(query, (archivo_id,))
        filas = cursor.fetchall()
        conn.close()

        # Extraemos los nombres en una lista limpia de strings
        actuales = [fila["nombre"] for fila in filas]
        return jsonify(actuales)

    except Exception as e:
        print(f"Error al obtener metadatos actuales: {e}")
        return jsonify([]), 500
    
@app.route('/api/personas2')
def get_catalogo_personas():
    try:
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=6, type=int)
        search_query = request.args.get('q', default='', type=str).strip()

        if page < 1: page = 1
        if limit < 1: limit = 6
        offset = (page - 1) * limit

        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Contar el total para la paginación
        count_query = "SELECT COUNT(*) as total FROM personas WHERE nombre LIKE ?;"
        cursor.execute(count_query, (f"%{search_query}%",))
        total_records = cursor.fetchone()['total']
        total_pages = math.ceil(total_records / limit) if total_records > 0 else 1

        # 2. SQL: Traemos el 'filename' y el 'type' del último archivo de cada persona
        main_query = """
            SELECT 
                p.id,
                p.nombre,
                COUNT(ap.archivo_id) as total_archivos,
                (
                    SELECT a.filename 
                    FROM archivo_personas ap_sub
                    JOIN archivos a ON ap_sub.archivo_id = a.id
                    WHERE ap_sub.persona_id = p.id
                    ORDER BY a.id DESC LIMIT 1
                ) as ultimo_filename,
                (
                    SELECT a.tipo 
                    FROM archivo_personas ap_sub
                    JOIN archivos a ON ap_sub.archivo_id = a.id
                    WHERE ap_sub.persona_id = p.id
                    ORDER BY a.id DESC LIMIT 1
                ) as ultimo_tipo
            FROM personas p
            LEFT JOIN archivo_personas ap ON p.id = ap.persona_id
            WHERE p.nombre LIKE ?
            GROUP BY p.id
            ORDER BY total_archivos DESC, p.nombre ASC
            LIMIT ? OFFSET ?;
        """
        
        cursor.execute(main_query, (f"%{search_query}%", limit, offset))
        filas = cursor.fetchall()
        conn.close()

        lista_personas = []
        for fila in filas:
            filename = fila["ultimo_filename"]
            tipo = fila["ultimo_tipo"]
            avatar_url = None

            if filename:
                if tipo == "video":
                    # --- LÓGICA DE EXTRACCIÓN DEL FOTOGRAMA ---
                    nombre_miniatura = f"thumb_{filename}.jpg"
                    ruta_miniatura_fisica = os.path.join(AVATAR_CACHE_FOLDER, nombre_miniatura)
                    
                    # Si la miniatura no se ha generado antes, la creamos ahora
                    if not os.path.exists(ruta_miniatura_fisica):
                        ruta_video_real = os.path.join(MEDIA_FOLDER, filename)
                        
                        cap = cv2.VideoCapture(ruta_video_real)
                        success, frame = cap.read() # Lee el primer fotograma
                        if success:
                            # Guardamos el fotograma como un archivo JPG físico
                            cv2.imwrite(ruta_miniatura_fisica, frame)
                        cap.release()
                    
                    # La URL del avatar apuntará a la miniatura en la caché
                    avatar_url = f"/media/cache_avatars/{nombre_miniatura}"
                else:
                    # Si es una imagen ordinaria, usamos tu endpoint /media/ de forma directa
                    avatar_url = f"/media/{filename}"

            es_portada = True if fila["total_archivos"] > 10 else False 

            lista_personas.append({
                "id": fila["id"],
                "nombre": fila["nombre"],
                "total_archivos": fila["total_archivos"],
                "ultima_aparicion": "4 días" if fila['total_archivos'] > 0 else None,
                "es_portada": es_portada,
                "avatar_url": avatar_url
            })

        return jsonify({
            "personas": lista_personas,
            "total_pages": total_pages,
            "current_page": page
        })

    except Exception as e:
        print(f"Error crítico en la API de personas: {e}")
        return jsonify({"personas": [], "total_pages": 1, "current_page": 1, "error": str(e)}), 500


if __name__ == "__main__":
    sincronizar_archivos()
    app.run(debug=True, port=5000)
