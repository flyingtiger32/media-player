import os
import random
from flask import Flask, jsonify, render_template, send_from_directory, request
from flask_cors import CORS
import sqlite3
import math
import cv2
from datetime import datetime, timezone


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

def calcular_tiempo_relativo(fecha_str):
    """
    Convierte un string de fecha de la base de datos en un formato amigable.
    Maneja zonas horarias de forma limpia y elimina decimales.
    """
    if not fecha_str:
        return "Desconocida"
    
    try:
        # 1. Parsear la fecha de la DB (SQLite suele guardarla en UTC)
        if isinstance(fecha_str, str):
            formato = '%Y-%m-%d %H:%M:%S'
            # Limpiamos microsegundos si existen y parseamos
            fecha_dt = datetime.strptime(fecha_str.split('.')[0], formato)
        else:
            fecha_dt = fecha_str

        # Forzamos a que la fecha de la DB sea tratada como UTC si no tiene zona horaria
        if fecha_dt.tzinfo is None:
            fecha_dt = fecha_dt.replace(tzinfo=timezone.utc)

        # 2. Obtener la hora actual en UTC para que la comparativa sea justa
        ahora = datetime.now(timezone.utc)
        
        # 3. Calcular diferencia
        diferencia = ahora - fecha_dt
        segundos = int(diferencia.total_seconds())

        # Si por milisegundos de diferencia da negativo, lo tratamos como inmediato
        if segundos < 0:
            return "unos segundos"
        
        # 4. Cálculos limpios con división entera (//) para evitar decimales (.0)
        minutos = segundos // 60
        horas = minutos // 60
        dias = diferencia.days # .days ya devuelve un entero limpio

        # 5. Retornar el texto amigable
        if dias > 0:
            if dias == 1:
                return "1 día"
            return f"{dias} días"
        elif horas > 0:
            if horas == 1:
                return "1 hora"
            return f"{horas} horas"
        elif minutos > 0:
            if minutos == 1:
                return "1 minuto"
            return f"{minutos} minutos"
        else:
            return "unos segundos"
            
    except Exception as e:
        print(f"Error parseando fecha '{fecha_str}': {e}")
        return "Recientemente"


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

@app.route("/classify")
def vista_clasificacion_rapida():
    # Aseguramos que la lista global de pendientes esté cargada al entrar
    global playlist_pendientes
    if not playlist_pendientes:
        cargar_playlist_pendientes()
        
    return render_template("classify.html")


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
    
@app.route('/personas/<int:persona_id>')
def vista_detalle_persona(persona_id):
    # Simplemente renderiza la plantilla y le pasa la variable persona_id al HTML
    return render_template('persona_detalle.html', persona_id=persona_id)


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
        # Asegúrate de que las filas se devuelvan como diccionarios si usas SQLite
        # conn.row_factory = sqlite3.Row 
        cursor = conn.cursor()

        # 1. Contar el total para la paginación
        count_query = "SELECT COUNT(*) as total FROM personas WHERE nombre LIKE ?;"
        cursor.execute(count_query, (f"%{search_query}%",))
        total_records = cursor.fetchone()['total']
        total_pages = math.ceil(total_records / limit) if total_records > 0 else 1

        # 2. SQL: Traemos el 'filename', 'tipo' y el 'created_at' del último archivo de cada persona
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
                    ORDER BY ap_sub.created_at DESC, a.id DESC LIMIT 1
                ) as ultimo_filename,
                (
                    SELECT a.tipo 
                    FROM archivo_personas ap_sub
                    JOIN archivos a ON ap_sub.archivo_id = a.id
                    WHERE ap_sub.persona_id = p.id
                    ORDER BY ap_sub.created_at DESC, a.id DESC LIMIT 1
                ) as ultimo_tipo,
                (
                    SELECT MAX(ap_sub.created_at)
                    FROM archivo_personas ap_sub
                    WHERE ap_sub.persona_id = p.id
                ) as ultima_fecha_aparicion
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
                    nombre_miniatura = f"thumb_{filename}.jpg"
                    ruta_miniatura_fisica = os.path.join(AVATAR_CACHE_FOLDER, nombre_miniatura)
                    
                    if not os.path.exists(ruta_miniatura_fisica):
                        ruta_video_real = os.path.join(MEDIA_FOLDER, filename)
                        cap = cv2.VideoCapture(ruta_video_real)
                        success, frame = cap.read()
                        if success:
                            cv2.imwrite(ruta_miniatura_fisica, frame)
                        cap.release()
                    
                    avatar_url = f"/media/cache_avatars/{nombre_miniatura}"
                else:
                    avatar_url = f"/media/{filename}"

            es_portada = True if fila["total_archivos"] > 790 else False 

            # Calculamos dinámicamente la última aparición en base a la base de datos
            tiempo_relativo = None
            if fila["total_archivos"] > 0 and fila["ultima_fecha_aparicion"]:
                tiempo_relativo = calcular_tiempo_relativo(fila["ultima_fecha_aparicion"])

            lista_personas.append({
                "id": fila["id"],
                "nombre": fila["nombre"],
                "total_archivos": fila["total_archivos"],
                "ultima_aparicion": tiempo_relativo,
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
    

@app.route('/api/personas/<int:persona_id>/desasociar/<int:archivo_id>', methods=['DELETE'])
def desasociar_archivo_persona(persona_id, archivo_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Ejecutamos el DELETE en la tabla intermedia
        # Esto rompe el vínculo sin borrar el archivo físico ni a la persona
        cursor.execute("""
            DELETE FROM archivo_personas 
            WHERE persona_id = ? AND archivo_id = ?;
        """, (persona_id, archivo_id))

        # 2. Guardamos los cambios
        conn.commit()
        
        # Comprobamos si realmente se eliminó alguna fila
        filas_afectadas = cursor.rowcount
        conn.close()

        if filas_afectadas == 0:
            return jsonify({
                "status": "warning",
                "message": "No se encontró la vinculación especificada."
            }), 404

        # 3. Respuesta de éxito limpia para el frontend
        return jsonify({
            "status": "success",
            "message": f"Archivo {archivo_id} desasociado correctamente de la persona {persona_id}."
        }), 200

    except Exception as e:
        print(f"Error en la API de desasociación: {e}")
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500
    
@app.route("/api/fast/guardar", methods=["POST"])
def guardar_clasificacion_rapida():
    try:
        data = request.get_json()
        archivo_id = data.get("archivo_id")
        albumes = data.get("albumes", [])      # Lista de strings
        personas = data.get("personas", [])    # Lista de strings
        es_favorito = data.get("favorito", False) # Booleano: True/False

        if not archivo_id:
            return jsonify({"status": "error", "message": "ID de archivo requerido"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. GESTIÓN DE FAVORITOS (En su tabla independiente)
        if es_favorito:
            # Si el usuario lo marcó, lo metemos en la tabla favoritos
            # Nota: Si tu 'created_at' no tiene DEFAULT CURRENT_TIMESTAMP, puedes meter datetime.now()
            cursor.execute(
                "INSERT OR IGNORE INTO favoritos (archivo_id) VALUES (?);", 
                (archivo_id,)
            )
        else:
            # Si no está marcado, nos aseguramos de que no exista en esa tabla
            cursor.execute(
                "DELETE FROM favoritos WHERE archivo_id = ?;", 
                (archivo_id,)
            )

        # 2. Procesar todos los Álbumes en bloque
        for nombre_album in albumes:
            nombre_album = nombre_album.strip()
            if not nombre_album: continue
            
            cursor.execute("INSERT OR IGNORE INTO albumes (nombre) VALUES (?)", (nombre_album,))
            cursor.execute("SELECT id FROM albumes WHERE nombre = ?", (nombre_album,))
            album_id = cursor.fetchone()["id"]
            
            cursor.execute(
                "INSERT OR IGNORE INTO archivo_albumes (archivo_id, album_id) VALUES (?, ?)",
                (archivo_id, album_id),
            )

        # 3. Procesar todas las Personas en bloque
        for nombre_persona in personas:
            nombre_persona = nombre_persona.strip()
            if not nombre_persona: continue

            cursor.execute("INSERT OR IGNORE INTO personas (nombre) VALUES (?)", (nombre_persona,))
            cursor.execute("SELECT id FROM personas WHERE nombre = ?", (nombre_persona,))
            persona_id = cursor.fetchone()["id"]

            cursor.execute(
                "INSERT OR IGNORE INTO archivo_personas (archivo_id, persona_id) VALUES (?, ?)",
                (archivo_id, persona_id),
            )

        conn.commit()
        conn.close()
        
        return jsonify({
            "status": "success", 
            "message": "Archivo clasificado y estado de favorito actualizado."
        })

    except Exception as e:
        print(f"Error en guardado rápido con favoritos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    

@app.route("/api/fast/sugerencias")
def obtener_sugerencias():
    try:
        q = request.args.get("q", "").strip()
        tipo = request.args.get("tipo", "") # "albumes" o "personas"

        if not q or tipo not in ["albumes", "personas"]:
            return jsonify([])

        conn = get_db_connection()
        cursor = conn.cursor()

        # Buscamos coincidencias parciales usando LIKE
        if tipo == "albumes":
            cursor.execute("SELECT nombre FROM albumes WHERE nombre LIKE ? LIMIT 8;", (f"%{q}%",))
        else:
            cursor.execute("SELECT nombre FROM personas WHERE nombre LIKE ? LIMIT 8;", (f"%{q}%",))

        filas = cursor.fetchall()
        conn.close()

        sugerencias = [fila["nombre"] for fila in filas]
        return jsonify(sugerencias)

    except Exception as e:
        print(f"Error en sugerencias: {e}")
        return jsonify([])
    

@app.route('/api/personas/<int:persona_id>')
def get_archivos_persona(persona_id):
    try:
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=30, type=int) # Ajustado al formato 5x6 (30 por página)
        
        if page < 1: page = 1
        if limit < 1: limit = 30
        offset = (page - 1) * limit

        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Validar persona y sacar su nombre
        cursor.execute("SELECT nombre FROM personas WHERE id = ?;", (persona_id,))
        persona = cursor.fetchone()
        if not persona:
            conn.close()
            return jsonify({"error": "Persona no encontrada"}), 404
        nombre_persona = persona['nombre']

        # 2. Paginación: Contar total de archivos de esta persona
        cursor.execute("SELECT COUNT(*) as total FROM archivo_personas WHERE persona_id = ?;", (persona_id,))
        total_records = cursor.fetchone()['total']
        total_pages = math.ceil(total_records / limit) if total_records > 0 else 1

        # 3. 🔥 NUEVO: Obtener TODOS los álbumes únicos en los que aparece esta persona (Sin importar la página)
        # Esto nos permite pintar las carpetas del Tab B completas sin perder datos por el LIMIT
        albumes_globales_query = """
            SELECT al.id, al.nombre, COUNT(ap.archivo_id) as total_coincidencias
            FROM albumes al
            JOIN archivo_albumes aa ON al.id = aa.album_id
            JOIN archivo_personas ap ON aa.archivo_id = ap.archivo_id
            WHERE ap.persona_id = ?
            GROUP BY al.id, al.nombre;
        """
        cursor.execute(albumes_globales_query, (persona_id,))
        filas_albumes = cursor.fetchall()
        
        # Mapeamos incluyendo la propiedad que tu JS viejo (U Opción B) esperaba
        lista_albumes_asociados = [
            {
                "id": f["id"], 
                "nombre": f["nombre"], 
                "total_coincidencias": f["total_coincidencias"]
            } 
            for f in filas_albumes
        ]

        # 4. Traer los archivos paginados del Grid
        main_query = """
            SELECT a.id, a.filename, a.tipo, CASE WHEN f.archivo_id IS NOT NULL THEN 1 ELSE 0 END as es_favorito -- He corregido 'tipo' por 'type' según tu tabla de antes
            FROM archivos a
            JOIN archivo_personas ap ON a.id = ap.archivo_id
            LEFT JOIN favoritos f ON a.id = f.archivo_id
            WHERE ap.persona_id = ?
            ORDER BY a.id DESC
            LIMIT ? OFFSET ?;
        """
        cursor.execute(main_query, (persona_id, limit, offset))
        filas_archivos = cursor.fetchall()

        # 5. Construir los archivos inyectando sus álbumes internos
        lista_archivos = []
        for fila in filas_archivos:
            archivo_id = fila["id"]
            filename = fila["filename"]
            tipo = fila["tipo"]
            is_favorite = bool(fila["es_favorito"])
            
            # Subconsulta para saber en qué álbumes está ESTE archivo concreto (puede ser más de uno)
            cursor.execute("""
                SELECT al.id, al.nombre 
                FROM albumes al
                JOIN archivo_albumes aa ON al.id = aa.album_id
                WHERE aa.archivo_id = ?;
            """, (archivo_id,))
            filas_alb_archivo = cursor.fetchall()
            albumes_del_archivo = [{"id": fa["id"], "nombre": fa["nombre"]} for fa in filas_alb_archivo]

            # Procesamiento de miniaturas (On-demand)
            if tipo == "video":
                nombre_miniatura = f"thumb_{filename}.jpg"
                ruta_miniatura_fisica = os.path.join(AVATAR_CACHE_FOLDER, nombre_miniatura)
                if not os.path.exists(ruta_miniatura_fisica):
                    ruta_video_real = os.path.join(MEDIA_FOLDER, filename)
                    cap = cv2.VideoCapture(ruta_video_real)
                    success, frame = cap.read()
                    if success:
                        cv2.imwrite(ruta_miniatura_fisica, frame)
                    cap.release()
                thumb_url = f"/media/cache_avatars/{nombre_miniatura}"
            else:
                thumb_url = f"/media/{filename}"

            lista_archivos.append({
                "id": archivo_id,
                "filename": filename,
                "tipo": tipo,
                "media_url": f"/media/{filename}",
                "thumb_url": thumb_url,
                "es_favorito": is_favorite,
                "albumes": albumes_del_archivo # 📦 ¡Tu objeto indexado! Ideal para filtros reactivos o playlists
            })

        conn.close()

        # 6. Respuesta JSON unificada impecable
        return jsonify({
            "persona_id": persona_id,
            "persona_nombre": nombre_persona,
            "total_archivos": total_records,
            "total_pages": total_pages,
            "current_page": page,
            "albumes_asociados": lista_albumes_asociados, # 📁 Lista global para el switch sin llamadas extra
            "archivos": lista_archivos
        })

    except Exception as e:
        print(f"Error en API unificada: {e}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/archivos/count')
def count_archivos():
    try:
        conn=get_db_connection()
        cursor=conn.cursor()
        count_query = "SELECT COUNT(*) AS total FROM archivos;"
        cursor.execute(count_query)
        total_records = cursor.fetchone()['total']
        return jsonify({"total_archivos":total_records, "success": True}), 200
    except Exception as e:
        print('Error en count de archivos')
        return jsonify({"error": str(e) }), 500
    
@app.route('/player/persona')
def player_persona():
    try:
        # 📥 Capturamos el parámetro '?archivo=XXXX' de la URL
        archivo_id = request.args.get('archivo', type=int)
        
        if not archivo_id:
            return "Falta el ID del archivo multimedia.", 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Consultamos los datos técnicos del archivo y si es favorito
        query = """
            SELECT 
                a.id, 
                a.filename, 
                a.tipo,
                CASE WHEN f.archivo_id IS NOT NULL THEN 1 ELSE 0 END as es_favorito
            FROM archivos a
            LEFT JOIN favoritos f ON a.id = f.archivo_id
            WHERE a.id = ?;
        """
        cursor.execute(query, (archivo_id,))
        archivo = cursor.fetchone()

        if not archivo:
            conn.close()
            return "El archivo multimedia no existe.", 404

        # 2. 🔥 NUEVO: Sacamos qué personas están asociadas a este archivo concreto
        # Así, dentro del propio player, podrás mostrar etiquetas con sus nombres
        cursor.execute("""
            SELECT p.id, p.nombre 
            FROM personas p
            JOIN archivo_personas ap ON p.id = ap.persona_id
            WHERE ap.archivo_id = ?;
        """, (archivo_id,))
        filas_personas = cursor.fetchall()
        personas_asociadas = [{"id": p["id"], "nombre": p["nombre"]} for p in filas_personas]

        conn.close()

        # 3. Empaquetamos la info para Jinja2
        datos_media = {
            "id": archivo["id"],
            "filename": archivo["filename"],
            "type": archivo["tipo"],
            "src_url": f"/media/{archivo['filename']}",
            "is_favorite": bool(archivo["es_favorito"]),
            "personas": personas_asociadas
        }

        # Renderizamos la plantilla pasándole los datos limpios
        return render_template('player_persona.html', media=datos_media)

    except Exception as e:
        print(f"Error en el reproductor de personas: {e}")
        return f"Error interno del servidor: {str(e)}", 500
    

@app.route('/api/archivos/<int:archivo_id>/favorito', methods=['POST'])
def toggle_favorito(archivo_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Verificar si el archivo ya está en la tabla de favoritos
        cursor.execute("SELECT 1 FROM favoritos WHERE archivo_id = ?;", (archivo_id,))
        es_fav = cursor.fetchone()

        if es_fav:
            # Caso A: Ya existe -> Lo quitamos de favoritos
            cursor.execute("DELETE FROM favoritos WHERE archivo_id = ?;", (archivo_id,))
            nuevo_estado = False
            mensaje = "Eliminado de favoritos"
        else:
            # Caso B: No existe -> Lo añadimos insertando el archivo_id y la fecha actual
            fecha_actual = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(
                "INSERT INTO favoritos (archivo_id, fecha) VALUES (?, ?);", 
                (archivo_id, fecha_actual)
            )
            nuevo_estado = True
            mensaje = "Añadido a favoritos"

        conn.commit()
        conn.close()

        # Devuelve el estado real para que el Front-End se sincronice sin errores
        return jsonify({
            "status": "success",
            "archivo_id": archivo_id,
            "is_favorite": nuevo_estado,
            "message": mensaje
        }), 200

    except Exception as e:
        print(f"Error en la API de favoritos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    sincronizar_archivos()
    app.run(debug=True, port=5000)
    # app.run(debug=True, host='0.0.0.0', port=5000)
