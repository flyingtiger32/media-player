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
            
            // Acción principal: Clic en el cuerpo de la card abre el player
            card.onclick = () => {
                window.location.href = `/player/${file.id}`;
            };

            const isVideo = file.type === 'video';
            const badgeHTML = isVideo ? `<div class="video-badge">🎬 Vídeo</div>` : '';

            const esFavorito = file.is_favorite === true; 
            const favClass = esFavorito ? 'btn-overlay-action btn-fav-yellow is-fav' : 'btn-overlay-action btn-fav-yellow';

            // Inyectamos el HTML limpio (sin los onclick inline que rompían el stopPropagation)
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
                        desasociar
                    </button>
                </div>
            `;

            // ⚡ ASIGNACIÓN NATIVA DE EVENTOS (Aquí eliminamos el bug por completo)
            const btnFav = card.querySelector('.js-btn-fav');
            const btnDetach = card.querySelector('.js-btn-detach');

            // Evento Favorito
            btnFav.addEventListener('click', (e) => {
                e.stopPropagation(); // 💥 Bloqueo absoluto: No sube al player
                ejecutarToggleFavorito(file.id, btnFav);
            });

            // Evento Desasociar
            btnDetach.addEventListener('click', (e) => {
                e.stopPropagation(); // 💥 Bloqueo absoluto: No sube al player
                abrirModalDesasociarReal(file.id);
            });

            mediaGrid.appendChild(card);
        });
    }
    function toggleFavorito(event, archivoId, boton) {
        event.stopPropagation(); // Bloquea la redirección al reproductor

        // Atacamos al nuevo endpoint mediante POST
        fetch(`/api/archivos/${archivoId}/favorito`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(res => {
                if (!res.ok) throw new Error("Error en la red o servidor");
                return res.json();
            })
            .then(data => {
                if (data.status === "success") {
                    // Sincronizamos las clases y el estado basándonos en lo que guardó SQLite
                    if (data.is_favorite) {
                        boton.classList.add('is-fav');
                        console.log(`Guardado en favoritos con éxito.`);
                    } else {
                        boton.classList.remove('is-fav');
                        console.log(`Quitado de favoritos con éxito.`);
                    }
                }
            })
            .catch(err => {
                console.error("No se pudo cambiar el estado de favorito:", err);
                alert("Error al guardar el estado de favorito en la base de datos.");
            });
    }

    // --- 🛡️ MOTOR DEL MODAL REUTILIZABLE ---
    const confirmModal = document.getElementById('confirm-modal');
    const btnModalConfirm = document.getElementById('modal-btn-confirm');
    const btnModalCancel = document.getElementById('modal-btn-cancel');

    function abrirModalDesasociar(event, archivoId) {
        event.stopPropagation(); // Evita que se abra el reproductor de fondo
        archivoSeleccionadoParaDesasociar = archivoId; // Guardamos el ID en memoria
        confirmModal.classList.add('active'); // Muestra el modal con la animación blur
    }

    function cerrarModal() {
        confirmModal.classList.remove('active');
        archivoSeleccionadoParaDesasociar = null;
    }

    // Cerrar al pulsar cancelar o hacer clic fuera del cuadro
    btnModalCancel.addEventListener('click', cerrarModal);
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) cerrarModal();
    });

    // Al confirmar la acción real
    btnModalConfirm.addEventListener('click', () => {
        if (archivoSeleccionadoParaDesasociar) {
            console.log(`Procediendo a desasociar el archivo ID: ${archivoSeleccionadoParaDesasociar} de la persona ID: ${personaId}`);

            // Aquí harás la llamada real a tu backend para romper la relación de la tabla intermedia:
            // fetch(`/api/personas/${personaId}/desasociar/${archivoSeleccionadoParaDesasociar}`, { method: 'DELETE' })
            // .then(() => {  
            //     cerrarModal();
            //     loadData(); // Recarga la rejilla automáticamente
            // });

            // Simulación para testing en caliente:
            cerrarModal();
            loadData();
        }
    });

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

    function ejecutarToggleFavorito(archivoId, boton) {
        fetch(`/api/archivos/${archivoId}/favorito`, { method: 'POST' })
            .then(res => {
                if (!res.ok) throw new Error("Error en servidor");
                return res.json();
            })
            .then(data => {
                if (data.status === "success") {
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

    // --- 🛡️ GESTIÓN DEL MODAL DE CONFIRMACIÓN REUTILIZABLE ---
    function abrirModalDesasociarReal(archivoId) {
        archivoSeleccionadoParaDesasociar = archivoId;
        confirmModal.classList.add('active');
    }

    // Arrancar la pantalla
    loadData();
});