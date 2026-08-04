document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO PERSISTENTE EN LOCALSTORAGE ---
    let state = {
        sidebarOpen: localStorage.getItem('fav_state_sidebar') === 'true',
        filters: JSON.parse(localStorage.getItem('fav_state_filters') || '[]'), // Array de {id, type: 'persona'|'album', name}
        currentPage: 1,
        totalPages: 1,
        perPage: 30
    };

    let metadata = { personas: [], albumes: [] };
    let selectedFileForRemove = null;
    let listaFavoritosActual = [];
    let todosLosFavoritosIDs = [];


    // Elementos DOM
    const filterSidebar = document.getElementById('filter-sidebar');
    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const badgeActiveCount = document.getElementById('badge-active-count');

    const activeTagsContainer = document.getElementById('active-tags-container');
    const selectPersonas = document.getElementById('select-personas');
    const selectAlbumes = document.getElementById('select-albumes');
    const btnClearAll = document.getElementById('btn-clear-all');

    const mediaGrid = document.getElementById('media-grid');
    const pageTitle = document.getElementById('page-title');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInput = document.getElementById('page-input');
    const totalPagesSpan = document.getElementById('total-pages');

    const confirmModal = document.getElementById('confirm-modal');
    const btnModalConfirm = document.getElementById('modal-btn-confirm');
    const btnModalCancel = document.getElementById('modal-btn-cancel');

    // --- 1. MANEJO DEL SIDEBAR Y SU ESTADO ---
    function applySidebarState() {
        if (state.sidebarOpen) {
            filterSidebar.classList.add('open');
        } else {
            filterSidebar.classList.remove('open');
        }
        localStorage.setItem('fav_state_sidebar', state.sidebarOpen);
    }

    btnToggleFilters.addEventListener('click', () => {
        state.sidebarOpen = !state.sidebarOpen;
        applySidebarState();
    });

    btnCloseSidebar.addEventListener('click', () => {
        state.sidebarOpen = false;
        applySidebarState();
    });

    // --- 2. GESTIÓN DE FILTROS Y TAGS ---
    function saveFiltersState() {
        localStorage.setItem('fav_state_filters', JSON.stringify(state.filters));
        renderTags();
        state.currentPage = 1;
        fetchFavoritos();
    }

    function addFilter(id, type, name) {
        // Evitar duplicados
        const exists = state.filters.some(f => f.id === id && f.type === type);
        if (!exists) {
            state.filters.push({ id, type, name });
            saveFiltersState();
        }
    }

    function removeFilter(id, type) {
        state.filters = state.filters.filter(f => !(f.id === id && f.type === type));
        saveFiltersState();
    }

    function renderTags() {
        activeTagsContainer.innerHTML = "";

        if (state.filters.length === 0) {
            activeTagsContainer.innerHTML = `<span class="no-tags-msg">Sin filtros aplicados</span>`;
            badgeActiveCount.style.display = "none";
            return;
        }

        badgeActiveCount.textContent = state.filters.length;
        badgeActiveCount.style.display = "inline-block";

        state.filters.forEach(filter => {
            const tag = document.createElement('div');
            tag.className = "filter-tag";
            const icon = filter.type === 'persona' ? '👤' : '📁';

            tag.innerHTML = `
                <span>${icon} ${filter.name}</span>
                <button class="btn-remove-tag">&times;</button>
            `;

            tag.querySelector('.btn-remove-tag').addEventListener('click', () => {
                removeFilter(filter.id, filter.type);
            });

            activeTagsContainer.appendChild(tag);
        });
    }

    btnClearAll.addEventListener('click', () => {
        state.filters = [];
        saveFiltersState();
    });

    // --- 3. CARGAR METADATOS (SELECTS) ---
    function fetchMetadatos() {
        fetch('/api/favoritos/metadatos')
            .then(res => res.json())
            .then(data => {
                metadata = data;

                // Rellenar Personas
                selectPersonas.innerHTML = `<option value="">Seleccionar Persona...</option>`;
                data.personas.forEach(p => {
                    selectPersonas.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
                });

                // Rellenar Álbumes
                selectAlbumes.innerHTML = `<option value="">Seleccionar Álbum...</option>`;
                data.albumes.forEach(a => {
                    selectAlbumes.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
                });
            });
    }

    selectPersonas.addEventListener('change', (e) => {
        const personaId = parseInt(e.target.value);
        if (!personaId) return;
        const persona = metadata.personas.find(p => p.id === personaId);
        if (persona) {
            addFilter(persona.id, 'persona', persona.nombre);
            e.target.value = ""; // Reset del select
        }
    });

    selectAlbumes.addEventListener('change', (e) => {
        const albumId = parseInt(e.target.value);
        if (!albumId) return;
        const album = metadata.albumes.find(a => a.id === albumId);
        if (album) {
            addFilter(album.id, 'album', album.nombre);
            e.target.value = ""; // Reset del select
        }
    });

    // --- 4. PETICIÓN DEL GRID PRINCIPAL ---
    function fetchFavoritos() {
        const personasIds = state.filters.filter(f => f.type === 'persona').map(f => f.id).join(',');
        const albumesIds = state.filters.filter(f => f.type === 'album').map(f => f.id).join(',');

        const url = `/api/favoritos?page=${state.currentPage}&limit=${state.perPage}&personas=${personasIds}&albumes=${albumesIds}`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                listaFavoritosActual = data.archivos;
                pageTitle.textContent = `Favoritos (${data.total_archivos})`;
                state.totalPages = data.total_pages || 1;
                totalPagesSpan.textContent = state.totalPages;
                pageInput.value = state.currentPage;

                btnPrev.disabled = (state.currentPage <= 1);
                btnNext.disabled = (state.currentPage >= state.totalPages);

                renderGrid(data.archivos);
            });
    }

    function renderGrid(archivos) {
        mediaGrid.innerHTML = "";

        if (!archivos || archivos.length === 0) {
            mediaGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 40px;">No se encontraron favoritos con los filtros seleccionados.</div>`;
            return;
        }

        archivos.forEach(file => {
            const card = document.createElement('div');
            card.className = "media-item-card";

            // Función para abrir el reproductor al hacer click en una tarjeta
            card.onclick = () => {
                const personasSeleccionadas = state.filters
                    .filter(f => f.type === "persona")
                    .map(f => f.id);
                const albumesSeleccionados = state.filters
                    .filter(f => f.type === "album")
                    .map(f => f.id);
                // 1. Recopilamos los filtros actualmente seleccionados en la UI
                // (Ajusta los nombres de tus variables de filtros según tu código)
                const filtrosActivos = {
                    personas: Array.from(personasSeleccionadas), // Ej: [1, 4]
                    albumes: Array.from(albumesSeleccionados)
                };

                // 2. Guardamos los filtros en localStorage
                localStorage.setItem('favoritos_filtros_activos', JSON.stringify(filtrosActivos));

                // 3. Abrimos el reproductor
                window.location.href = `/player/favoritos?archivo=${file.id}`;
            };

            const isVideo = file.tipo === 'video';
            const badgeHTML = isVideo ? `<div class="video-badge">🎬 Vídeo</div>` : '';

            card.innerHTML = `
                <img class="media-preview" src="${file.thumb_url}" alt="${file.filename}" loading="lazy">
                ${badgeHTML}
                <div class="media-actions-overlay">
                    <button class="btn-overlay-action btn-fav-yellow is-fav js-btn-unfav" title="Quitar de Favoritos">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                        </svg>
                    </button>
                </div>
            `;

            card.querySelector('.js-btn-unfav').addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFileForRemove = file.id;
                confirmModal.classList.add('active');
            });

            mediaGrid.appendChild(card);
        });
    }

    // --- 5. PAGINACIÓN Y MODAL ---
    btnPrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            fetchFavoritos();
        }
    });

    btnNext.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            fetchFavoritos();
        }
    });

    btnModalCancel.addEventListener('click', () => {
        confirmModal.classList.remove('active');
        selectedFileForRemove = null;
    });

    btnModalConfirm.addEventListener('click', () => {
        if (selectedFileForRemove) {
            fetch(`/api/archivos/${selectedFileForRemove}/favorito`, { method: 'POST' })
                .then(() => {
                    confirmModal.classList.remove('active');
                    selectedFileForRemove = null;
                    fetchFavoritos(); // Recargar grid y metadatos
                    fetchMetadatos();
                });
        }
    });

    // --- ARRANQUE DE LA APLICACIÓN ---
    applySidebarState();
    renderTags();
    fetchMetadatos();
    fetchFavoritos();
});