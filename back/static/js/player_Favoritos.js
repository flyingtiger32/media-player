document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const archivoIdInicial = urlParams.get('archivo');

    // Elementos DOM del Reproductor
    const mediaFilename = document.getElementById('media-filename');
    const playlistCounter = document.getElementById('playlist-counter');
    const mediaContent = document.getElementById('media-content');
    const btnPrev = document.getElementById('btn-prev-media');
    const btnNext = document.getElementById('btn-next-media');
    const btnFav = document.getElementById('btn-toggle-fav');

    // Elementos DOM del Footer (Tags)
    const tagsPersonas = document.getElementById('tags-personas');
    const tagsAlbumes = document.getElementById('tags-albumes');

    // Elementos DOM del Modal
    const modal = document.getElementById('modal-asociar');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input-search');
    const btnModalSave = document.getElementById('btn-modal-save');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Estado local
    let playlist = [];
    let currentIndex = -1;
    let targetTipoModal = null; // 'persona' o 'album'

// =========================================================================
    // INICIALIZACIÓN DE PLAYLIST FILTRADA (DESDE STORAGE)
    // =========================================================================
// =========================================================================
// INICIALIZACIÓN DE PLAYLIST FILTRADA DESDE LOCALSTORAGE
// =========================================================================
async function inicializarReproductor() {
    try {
        // 1. Obtener filtros guardados desde el grid
        const filtrosGuardados = JSON.parse(localStorage.getItem('favoritos_filtros_activos') || '{}');
        
        // 2. Construir la URL con QueryParams
        const urlParams = new URLSearchParams();

        if (filtrosGuardados.personas && Array.isArray(filtrosGuardados.personas)) {
            filtrosGuardados.personas.forEach(p => urlParams.append('persona', p));
        }
        if (filtrosGuardados.albumes && Array.isArray(filtrosGuardados.albumes)) {
            filtrosGuardados.albumes.forEach(a => urlParams.append('album', a));
        }
        if (filtrosGuardados.tipo) {
            urlParams.append('tipo', filtrosGuardados.tipo);
        }

        // 3. Pedir al servidor TODAS las IDs que cumplen los filtros
        const response = await fetch(`/api/favoritos/ids?${urlParams.toString()}`);
        const idsFiltrados = await response.json();

        if (Array.isArray(idsFiltrados) && idsFiltrados.length > 0) {
            playlist = idsFiltrados.map(id => ({ id: id }));
            currentIndex = playlist.findIndex(f => String(f.id) === String(archivoIdInicial));
        }
    } catch (err) {
        console.error("Error al obtener IDs filtradas del servidor:", err);
    }

    // Fallback por si acaso
    if (currentIndex === -1 && archivoIdInicial) {
        playlist = [{ id: archivoIdInicial }];
        currentIndex = 0;
    }

    // 4. Iniciar reproductor
    if (playlist.length > 0) {
        cargarMedia(currentIndex);
    } else {
        console.warn("No hay elementos en la playlist.");
    }
}

    // =========================================================================
    // FUNCIONES EXISTENTES (SIN MODIFICACIONES)
    // =========================================================================

    function cargarMedia(index) {
        if (index < 0 || index >= playlist.length) return;

        currentIndex = index;
        const archivoBase = playlist[currentIndex];

        // Actualizar URL sin recargar la página
        const newUrl = `/player/favoritos?archivo=${archivoBase.id}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);

        // Actualizar contador y estado de botones
        playlistCounter.textContent = `${currentIndex + 1} / ${playlist.length}`;
        btnPrev.disabled = currentIndex === 0;
        btnNext.disabled = currentIndex === playlist.length - 1;

        // Consultamos la API para traer la información completa (personas, álbumes, etc.)
        fetch(`/api/archivos/${archivoBase.id}`)
            .then(res => res.json())
            .then(data => {
                playlist[currentIndex] = data;
                renderMediaElement(data);
                renderFooterTags(data);
            })
            .catch(err => {
                console.error("Error al obtener detalle del archivo:", err);
                renderMediaElement(archivoBase);
            });
    }

    function renderMediaElement(archivo) {
        mediaFilename.textContent = archivo.filename || `Archivo ${archivo.id}`;

        if (archivo.es_favorito !== false) {
            btnFav.classList.add('is-fav');
        } else {
            btnFav.classList.remove('is-fav');
        }

        mediaContent.innerHTML = '';

        const isVideo = archivo.tipo === 'video' || (archivo.filename && archivo.filename.match(/\.(mp4|webm|mkv|mov)$/i));

        if (isVideo) {
            const videoEl = document.createElement('video');
            videoEl.src = archivo.url || `/media/${archivo.filename}`;
            videoEl.controls = true;
            videoEl.autoplay = true;
            videoEl.className = 'media-player-element';
            mediaContent.appendChild(videoEl);
        } else {
            const imgEl = document.createElement('img');
            imgEl.src = archivo.url || `/media/${archivo.filename}`;
            imgEl.alt = archivo.filename;
            imgEl.className = 'media-player-element';
            mediaContent.appendChild(imgEl);
        }
    }

    function renderFooterTags(archivo) {
        if (!tagsPersonas || !tagsAlbumes) return;

        tagsPersonas.innerHTML = '';
        tagsAlbumes.innerHTML = '';

        const personas = archivo.personas || [];
        personas.forEach(p => {
            const tag = document.createElement('div');
            tag.className = 'tag-item';

            const link = document.createElement('a');
            link.href = `/personas/${p.id}`;
            link.textContent = p.nombre || `Persona ${p.id}`;
            link.style.color = 'inherit';
            link.style.textDecoration = 'none';

            const btnRemove = document.createElement('button');
            btnRemove.className = 'tag-remove';
            btnRemove.innerHTML = '&times;';
            btnRemove.title = 'Desasociar persona';
            btnRemove.onclick = (e) => {
                e.stopPropagation();
                desasociarEntidad('personas', p.id);
            };

            tag.appendChild(link);
            tag.appendChild(btnRemove);
            tagsPersonas.appendChild(tag);
        });

        const btnAddPersona = document.createElement('button');
        btnAddPersona.className = 'tag-item tag-add-btn';
        btnAddPersona.textContent = '+';
        btnAddPersona.title = 'Añadir persona';
        btnAddPersona.onclick = () => abrirModal('persona');
        tagsPersonas.appendChild(btnAddPersona);

        const albumes = archivo.albumes || [];
        albumes.forEach(a => {
            const tag = document.createElement('div');
            tag.className = 'tag-item';

            const link = document.createElement('a');
            link.href = `/albumes/${a.id}`;
            link.textContent = a.nombre || `Álbum ${a.id}`;
            link.style.color = 'inherit';
            link.style.textDecoration = 'none';

            const btnRemove = document.createElement('button');
            btnRemove.className = 'tag-remove';
            btnRemove.innerHTML = '&times;';
            btnRemove.title = 'Desasociar álbum';
            btnRemove.onclick = (e) => {
                e.stopPropagation();
                desasociarEntidad('albumes', a.id);
            };

            tag.appendChild(link);
            tag.appendChild(btnRemove);
            tagsAlbumes.appendChild(tag);
        });

        const btnAddAlbum = document.createElement('button');
        btnAddAlbum.className = 'tag-item tag-add-btn';
        btnAddAlbum.textContent = '+';
        btnAddAlbum.title = 'Añadir álbum';
        btnAddAlbum.onclick = () => abrirModal('album');
        tagsAlbumes.appendChild(btnAddAlbum);
    }

    function desasociarEntidad(tipoEndpoint, entidadId) {
        const archivoActual = playlist[currentIndex];
        if (!archivoActual) return;

        fetch(`/api/archivos/${archivoActual.id}/${tipoEndpoint}/${entidadId}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => cargarMedia(currentIndex))
            .catch(err => console.error(`Error al desasociar ${tipoEndpoint}:`, err));
    }

    function abrirModal(tipo) {
        if (!modal) return;
        targetTipoModal = tipo;
        modalTitle.textContent = tipo === 'persona' ? 'Añadir Persona' : 'Añadir a Álbum';
        modalInput.placeholder = tipo === 'persona' ? 'Nombre o ID de la persona...' : 'Nombre o ID del álbum...';
        modalInput.value = '';
        modal.classList.remove('hidden');
        modalInput.focus();
    }

    function cerrarModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        targetTipoModal = null;
    }

    if (btnCloseModal) btnCloseModal.addEventListener('click', cerrarModal);
    if (btnModalCancel) btnModalCancel.addEventListener('click', cerrarModal);

    if (btnModalSave) {
        btnModalSave.addEventListener('click', () => {
            const valor = modalInput.value.trim();
            const archivoActual = playlist[currentIndex];
            if (!valor || !archivoActual || !targetTipoModal) return;

            const endpoint = targetTipoModal === 'persona' ? 'personas' : 'albumes';

            fetch(`/api/archivos/${archivoActual.id}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: valor })
            })
                .then(res => res.json())
                .then(() => {
                    cerrarModal();
                    cargarMedia(currentIndex);
                })
                .catch(err => console.error("Error al asociar:", err));
        });
    }

    btnPrev.addEventListener('click', () => {
        if (currentIndex > 0) cargarMedia(currentIndex - 1);
    });

    btnNext.addEventListener('click', () => {
        if (currentIndex < playlist.length - 1) cargarMedia(currentIndex + 1);
    });

    document.addEventListener('keydown', (e) => {
        const isModalOpen = modal && !modal.classList.contains('hidden');

        if (!isModalOpen) {
            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                cargarMedia(currentIndex - 1);
            } else if (e.key === 'ArrowRight' && currentIndex < playlist.length - 1) {
                cargarMedia(currentIndex + 1);
            }
        } else if (e.key === 'Escape') {
            cerrarModal();
        }
    });

    btnFav.addEventListener('click', () => {
        const archivoActual = playlist[currentIndex];
        if (!archivoActual) return;

        fetch(`/api/archivos/${archivoActual.id}/favorito`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === "success") {
                    archivoActual.es_favorito = data.is_favorite;
                    if (data.is_favorite) {
                        btnFav.classList.add('is-fav');
                    } else {
                        btnFav.classList.remove('is-fav');
                    }
                }
            })
            .catch(err => console.error("Error al actualizar favorito:", err));
    });

    // Iniciar carga asíncrona de la playlist
    inicializarReproductor();
});