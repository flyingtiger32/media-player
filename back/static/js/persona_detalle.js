document.addEventListener('DOMContentLoaded', () => {
    // Extraer el ID de la persona de la URL actual (ej: /personas/31)
    const pathSegments = window.location.pathname.split('/');
    const personaId = pathSegments[pathSegments.length - 1];

    console.log(personaId)

    // Elementos DOM
    const personaTitle = document.getElementById('persona-title');
    const mediaGrid = document.getElementById('media-grid');
    const tabGaleria = document.getElementById('tab-galeria');
    const tabAlbumes = document.getElementById('tab-albumes');

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInput = document.getElementById('page-input');
    const totalPagesSpan = document.getElementById('total-pages');
    const paginationBox = document.getElementById('pagination');

    // Estado local (Fijo a 30 elementos por página: 5 columnas x 6 filas)
    let currentMode = "galeria"; // "galeria" o "albumes"
    let currentPage = 1;
    let totalPages = 1;
    let cacheData = null
    const PER_PAGE = 30;

    // --- 1. CONTROLADORES DEL SWITCH INTERRUPTOR ---
    tabGaleria.addEventListener('click', () => {
        if (currentMode === "galeria") return;
        currentMode = "galeria";
        tabAlbumes.classList.remove('active');
        tabGaleria.classList.add('active');
        currentPage = 1;
        paginationBox.style.display = "flex"; // La galería siempre lleva paginación
        loadData();
    });

    tabAlbumes.addEventListener('click', () => {
        if (currentMode === "albumes") return;
        currentMode = "albumes";
        tabGaleria.classList.remove('active');
        tabAlbumes.classList.add('active');
        currentPage = 1;
        paginationBox.style.display = "none"; // Los álbumes asociados suelen ser pocos, los sacamos en lista completa
        loadData();
    });

    function renderizarPantalla() {
        if (currentMode === "galeria") {
            paginationBox.style.display = "flex";
            renderGaleria(cacheData.archivos);
        } else {
            paginationBox.style.display = "none";
            // Pintamos las carpetas usando la lista unificada global
            renderAlbumes(cacheData.albumes_asociados);
        }
    }

    // --- 2. CONTROL DE PAGINACIÓN ---
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadData();

            // 🔥 Scroll suave hacia la parte superior de la ventana
            window.scrollTo({
                top: 0,
                behavior: 'smooth' // <- Esto hace la magia de la animación fluida
            });
        }
    });

    btnNext.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadData();

            // 🔥 Scroll suave hacia la parte superior de la ventana
            window.scrollTo({
                top: 0,
                behavior: 'smooth' // <- Esto hace la magia de la animación fluida
            });
        }
    });
    pageInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > totalPages) val = totalPages;
        currentPage = val;
        loadData();
    });

    // --- 3. ORQUESTADOR DE PETICIONES AL BACKEND ---
    function loadData() {
        if (currentMode === "albumes" && cacheData) {
            renderAlbumes(cacheData.albumes_asociados);
            return;
        }

        // Primera carga: hacemos la única petición API necesaria
        fetch(`/api/personas/${personaId}?page=${currentPage}&limit=${PER_PAGE}`)
            .then(res => res.json())
            .then(data => {
                cacheData = data; // Almacenamos el objeto completo

                // Actualizamos textos estáticos y paginador
                personaTitle.textContent = `${data.persona_nombre} (${data.total_archivos})`;
                totalPages = parseInt(data.total_pages) || 1;
                currentPage = parseInt(data.current_page) || 1;
                pageInput.value = currentPage;
                totalPagesSpan.textContent = totalPages;

                if (currentPage <= 1) {
                    btnPrev.setAttribute('disabled', 'true');
                } else {
                    btnPrev.removeAttribute('disabled');
                }

                if (currentPage >= totalPages) {
                    btnNext.setAttribute('disabled', 'true');
                } else {
                    btnNext.removeAttribute('disabled');
                }

                renderizarPantalla();
            });
    }

    // --- 4. RENDERIZADO MODO A: GALERÍA DE FOTOS/VÍDEOS ---
    function renderGaleria(archivos) {
        mediaGrid.innerHTML = "";
        if (!archivos || archivos.length === 0) {
            mediaGrid.innerHTML = `<div class="status-msg">Esta persona no tiene archivos asociados.</div>`;
            return;
        }

        archivos.forEach(file => {
            const card = document.createElement('div');
            card.className = "media-item-card";

            // Al hacer clic, abre tu visualizador/reproductor independiente
            card.onclick = () => {
                window.location.href = `/player/${file.id}`;
            };

            const isVideo = file.type === 'video';
            const badgeHTML = isVideo ? `<div class="video-badge">🎬 Vídeo</div>` : '';

            card.innerHTML = `
                    <img class="media-preview" src="${file.thumb_url}" alt="${file.filename}" loading="lazy">
                    ${badgeHTML}
                `;
            mediaGrid.appendChild(card);
        });
    }

    // --- 5. RENDERIZADO MODO B: CARPETAS DE ÁLBURMES FILTRADOS ---
    function renderAlbumes(albumes) {
        mediaGrid.innerHTML = "";
        if (!albumes || albumes.length === 0) {
            mediaGrid.innerHTML = `<div class="status-msg">Esta persona no está asignada a ningún álbum todavía.</div>`;
            return;
        }

        albumes.forEach(alb => {
            const card = document.createElement('div');
            card.className = "album-item-card";

            // Redirección inteligente: va a la vista del álbum pasándole el filtro de la persona por parámetro GET
            card.onclick = () => {
                window.location.href = `/albumes/${alb.id}?persona_id=${personaId}`;
            };

            card.innerHTML = `
                    <div>
                        <div class="album-icon">📁</div>
                        <h3 class="album-name">${alb.nombre}</h3>
                    </div>
                    <div class="album-count">📷 ${alb.total_coincidencias} fotos de esta persona aquí</div>
                `;
            mediaGrid.appendChild(card);
        });
    }

    // Arrancar la pantalla
    loadData();
});