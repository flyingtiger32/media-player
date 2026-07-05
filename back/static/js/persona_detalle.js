document.addEventListener('DOMContentLoaded', () => {
    // Extraer el ID de la persona de la URL actual (ej: /personas/31)
    const pathSegments = window.location.pathname.split('/');
    const personaId = pathSegments[pathSegments.length - 1];

    let archivoSeleccionadoParaDesasociar = null;

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

    // Elementos del Modal
    const confirmModal = document.getElementById('confirm-modal');
    const btnModalConfirm = document.getElementById('modal-btn-confirm');
    const btnModalCancel = document.getElementById('modal-btn-cancel');

    // Estado local (Fijo a 30 elementos por página)
    let currentMode = "galeria"; // "galeria" o "albumes"
    let currentPage = 1;
    let totalPages = 1;
    let cacheData = null;
    const PER_PAGE = 30;

    // --- 1. CONTROLADORES DEL SWITCH INTERRUPTOR ---
    tabGaleria.addEventListener('click', () => {
        if (currentMode === "galeria") return;
        currentMode = "galeria";
        tabAlbumes.classList.remove('active');
        tabGaleria.classList.add('active');
        currentPage = 1;
        paginationBox.style.display = "flex";
        loadData();
    });

    tabAlbumes.addEventListener('click', () => {
        if (currentMode === "albumes") return;
        currentMode = "albumes";
        tabGaleria.classList.remove('active');
        tabAlbumes.classList.add('active');
        currentPage = 1;
        paginationBox.style.display = "none";
        loadData();
    });

    function renderizarPantalla() {
        if (currentMode === "galeria") {
            paginationBox.style.display = "flex";
            renderGaleria(cacheData.archivos);
        } else {
            paginationBox.style.display = "none";
            renderAlbumes(cacheData.albumes_asociados);
        }
    }

    // --- 2. CONTROL DE PAGINACIÓN ---
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadData();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    btnNext.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadData();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

        fetch(`/api/personas/${personaId}?page=${currentPage}&limit=${PER_PAGE}`)
            .then(res => res.json())
            .then(data => {
                cacheData = data; 

                // Actualizamos textos estáticos y paginador
                personaTitle.textContent = `${data.persona_nombre} (${data.total_archivos})`;
                totalPages = parseInt(data.total_pages) || 1;
                currentPage = parseInt(data.current_page) || 1;
                pageInput.value = currentPage;
                totalPagesSpan.textContent = totalPages;

                // Atributos disabled nativos
                btnPrev.disabled = (currentPage <= 1);
                btnNext.disabled = (currentPage >= totalPages);

                renderizarPantalla();
            })
            .catch(err => {
                console.error("Error al obtener datos:", err);
                mediaGrid.innerHTML = `<div class="status-msg" style="color: #f43f5e;">Error al conectar con la base de datos.</div>`;
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
            
            card.onclick = () => {
                window.location.href = `/player/${file.id}`;
            };

            const isVideo = file.tipo === 'video';
            const badgeHTML = isVideo ? `<div class="video-badge">🎬 Vídeo</div>` : '';
            const favClass = file.es_favorito ? 'btn-overlay-action btn-fav-yellow is-fav' : 'btn-overlay-action btn-fav-yellow';

            card.innerHTML = `
                <img class="media-preview" src="${file.thumb_url}" alt="${file.filename}" loading="lazy">
                ${badgeHTML}
                <div class="media-actions-overlay">
                    <button class="${favClass} js-btn-fav" title="Marcar Favorito">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                        </svg>
                    </button>
                    <button class="btn-overlay-action btn-detach-red js-btn-detach" title="Desasociar archivo">
                        Desasociar
                    </button>
                </div>
            `;

            const btnFav = card.querySelector('.js-btn-fav');
            const btnDetach = card.querySelector('.js-btn-detach');

            btnFav.addEventListener('click', (e) => {
                e.stopPropagation(); 
                ejecutarToggleFavorito(file.id, btnFav);
            });

            btnDetach.addEventListener('click', (e) => {
                e.stopPropagation(); 
                abrirModalDesasociarReal(file.id);
            });

            mediaGrid.appendChild(card);
        });
    }

    // --- 5. RENDERIZADO MODO B: CARPETAS DE ÁLBUMES FILTRADOS ---
    function renderAlbumes(albumes) {
        mediaGrid.innerHTML = "";
        if (!albumes || albumes.length === 0) {
            mediaGrid.innerHTML = `<div class="status-msg">Esta persona no está asignada a ningún álbum todavía.</div>`;
            return;
        }

        albumes.forEach(alb => {
            const card = document.createElement('div');
            card.className = "album-item-card";

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

    // --- 6. OPERACIONES DE FAVORITO ---
    function ejecutarToggleFavorito(archivoId, boton) {
        fetch(`/api/archivos/${archivoId}/favorito`, { method: 'POST' })
            .then(res => {
                if (!res.ok) throw new Error("Error en servidor");
                return res.json();
            })
            .then(data => {
                if (data.status === "success") {
                    // Tu endpoint de Flask devuelve data.is_favorite según los logs del paso anterior
                    if (data.is_favorite) {
                        boton.classList.add('is-fav');
                        actualizarCacheFavorito(archivoId, true);
                    } else {
                        boton.classList.remove('is-fav');
                        actualizarCacheFavorito(archivoId, false);
                    }
                }
            })
            .catch(err => {
                console.error("Error al gestionar favorito:", err);
                alert("No se pudo guardar el estado del favorito.");
            });
    }

    // 🌟 LA FUNCIÓN QUE FALTABA: Mantiene el estado local sincronizado por si cambias de pestaña
    function actualizarCacheFavorito(archivoId, nuevoEstado) {
        if (cacheData && cacheData.archivos) {
            const archivo = cacheData.archivos.find(f => f.id === archivoId);
            if (archivo) {
                archivo.es_favorito = nuevoEstado;
            }
        }
    }

    // --- 7. GESTIÓN DEL MODAL DE CONFIRMACIÓN (DESASOCIAR) ---
    function abrirModalDesasociarReal(archivoId) {
        archivoSeleccionadoParaDesasociar = archivoId;
        confirmModal.classList.add('active');
    }

    function cerrarModal() {
        confirmModal.classList.remove('active');
        archivoSeleccionadoParaDesasociar = null;
    }

    btnModalCancel.addEventListener('click', cerrarModal);
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) cerrarModal();
    });

    // 💥 LLAMADA INTEGRADA AL ENDPOINT DELETE REAL
    btnModalConfirm.addEventListener('click', () => {
        if (archivoSeleccionadoParaDesasociar) {
            fetch(`/api/personas/${personaId}/desasociar/${archivoSeleccionadoParaDesasociar}`, { 
                method: 'DELETE' 
            })
            .then(res => {
                if (!res.ok) throw new Error("Error en la desasociación desde el backend");
                cerrarModal();
                loadData(); // Recarga limpia la galería actual
            })
            .catch(err => {
                console.error("Error al desasociar el archivo:", err);
                alert("Hubo un problema al desvincular el archivo de la base de datos.");
                cerrarModal();
            });
        }
    });

    // Arrancar la pantalla
    loadData();
});