document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const searchWrapper = document.getElementById('search-wrapper');
    const btnSearch = document.getElementById('btn-search');
    const searchInput = document.getElementById('search-input');
    const personasGrid = document.getElementById('personas-grid');

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageInput = document.getElementById('page-input');
    const totalPagesSpan = document.getElementById('total-pages');

    // Estado local de la paginación y búsqueda
    let currentPage = 1;
    let totalPages = 1;
    let searchQuery = "";

    // LIMITACIÓN DE CARDS POR PÁGINA (Ajustable para evitar saturación)
    const PER_PAGE = 6;

    // --- 1. ANIMACIÓN DE LA LUPA Y BUSCADOR ---
    btnSearch.addEventListener('click', (e) => {
        e.stopPropagation();
        searchWrapper.classList.toggle('active');

        if (searchWrapper.classList.contains('active')) {
            searchInput.focus();
        } else {
            if (searchInput.value !== "") {
                searchInput.value = "";
                searchQuery = "";
                currentPage = 1;
                fetchPersonas();
            }
        }
    });

    // Cerrar el buscador si se hace clic fuera de él y está vacío
    document.addEventListener('click', (e) => {
        if (!searchWrapper.contains(e.target) && searchInput.value.trim() === "") {
            searchWrapper.classList.remove('active');
        }
    });

    // Escucha en tiempo real a cada tecla para actualizar el grid dinámicamente
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        currentPage = 1; // Volvemos a la primera página con los nuevos filtros
        fetchPersonas();
    });

    // --- 2. LOGICA DE NAVEGACIÓN Y PAGINACIÓN ---
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchPersonas();
        }
    });

    btnNext.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchPersonas();
        }
    });

    // Permitir escribir el número de página en el input directamente
    pageInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > totalPages) val = totalPages;

        currentPage = val;
        e.target.value = val;
        fetchPersonas();
    });

    // --- 3. CONEXIÓN ASÍNCRONA CON LA API DEL SERVER ---
    function 
    fetchPersonas() {
        // Construimos la URL pasando los parámetros reales que leerá Flask en el backend
        const url = `/api/personas2?page=${currentPage}&limit=${PER_PAGE}&q=${encodeURIComponent(searchQuery)}`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                // Esperamos una estructura JSON clara: { personas: [...], total_pages: X, current_page: Y }
                totalPages = data.total_pages || 1;
                currentPage = data.current_page || 1;

                // Actualizamos los controles numéricos
                pageInput.value = currentPage;
                totalPagesSpan.textContent = totalPages;

                // Habilitar o deshabilitar flechas
                btnPrev.disabled = (currentPage <= 1);
                btnNext.disabled = (currentPage >= totalPages);

                renderGrid(data.personas);
            })
            .catch(err => {
                console.error("Error cargando personas de la API:", err);
                personasGrid.innerHTML = `<div class="status-msg" style="color: #f43f5e;">Error al conectar con la base de datos.</div>`;
            });
    }

    // --- 4. RENDERIZADOR DINÁMICO DE LAS CARDS EN EL DOM ---
    function renderGrid(personas) {
        personasGrid.innerHTML = "";

        if (!personas || personas.length === 0) {
            personasGrid.innerHTML = `<div class="status-msg">No se encontraron personas en el catálogo.</div>`;
            return;
        }

        personas.forEach(p => {
            // p.id, p.nombre, p.total_archivos, p.ultima_aparicion, p.es_portada, p.avatar_url
            const card = document.createElement('div');
            card.className = "persona-card";

            // Redirección al hacer click a la vista filtrada (futura implementación)
            card.onclick = () => {
                window.location.href = `/personas/${p.id}`;
            };

            // Si no tiene avatar configurado, usamos una imagen genérica por defecto
            const avatarImg = p.avatar_url ? p.avatar_url : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80';

            // Formateamos la última aparición de forma limpia humana
            const ultimaVez = p.ultima_aparicion ? `Hace ${p.ultima_aparicion}` : 'Desconocida';

            // Bloque condicional por si es portada de su catálogo
            const coverHTML = p.es_portada ? `<div class="persona-cover-badge">⭐ Portada</div>` : '';

            card.innerHTML = `
                    <img class="persona-avatar" src="${avatarImg}" alt="${p.nombre}">
                    <div class="persona-info">
                        <h2 class="persona-name">${p.nombre}</h2>
                        <div class="persona-stat">📷 ${p.total_archivos} fotografías</div>
                        <div class="persona-stat">🕒 Última aparición: ${ultimaVez}</div>
                        ${coverHTML}
                    </div>
                    <div class="arrow-link">➔</div>
                `;

            personasGrid.appendChild(card);
        });
    }

    // Disparar la primera carga nada más arrancar la pantalla
    fetchPersonas();
});