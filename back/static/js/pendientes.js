document.addEventListener('DOMContentLoaded', () => {
    // Elementos del menú desplegable de 3 puntos
    const btnOptions = document.getElementById('btn-options');
    const optionsDropdown = document.getElementById('options-dropdown');

    // Elementos del Modal
    const modal = document.getElementById('meta-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalLabel = document.getElementById('modal-label');
    const modalSelect = document.getElementById('modal-select');
    const modalClose = document.getElementById('modal-close');
    const btnModalSubmit = document.getElementById('btn-modal-submit');

    // Contenedores de opciones dinámicas del modal
    const newOptionContainer = document.getElementById('new-option-container');
    const newOptionInput = document.getElementById('new-option-input');
    const btnAddNewTag = document.getElementById('btn-add-new-tag');
    const tagsBox = document.getElementById('tags-box');

    let currentMode = ""; // "albumes" o "personas"
    let selectedTags = []; // Strings elegidos por el usuario

    // --- 1. CONTROL DEL DESPLEGABLE DE 3 PUNTOS ---
    if (btnOptions && optionsDropdown) {
        btnOptions.addEventListener('click', (e) => {
            e.stopPropagation();
            optionsDropdown.classList.toggle('hidden-menu');
            btnOptions.classList.toggle('active-trigger');
        });

        // CORREGIDO: Cerrar el menú haciendo click fuera de él
        document.addEventListener('click', (e) => {
            if (!optionsDropdown.classList.contains('hidden-menu') && !btnOptions.contains(e.target)) {
                optionsDropdown.classList.add('hidden-menu'); // Aquí faltaba .classList
                btnOptions.classList.remove('active-trigger');
            }
        });
    }

    // --- 2. GESTIÓN DE EVENTOS DE LOS BOTONES DEL DESPLEGABLE ---
    const dropdownButtons = document.querySelectorAll('.btn-dropdown-item');
    dropdownButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const text = btn.textContent.trim();

            if (text.includes("Favorito")) {
                if (typeof currentMediaId !== 'undefined' && currentMediaId) {
                    fetch('/api/pendientes/favorito', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ archivo_id: currentMediaId })
                    })
                        .then(res => res.json())
                        .then(data => {
                            if (data.status === "success") showToast("⭐ Añadido a favoritos");
                        });
                }
            } else if (text.includes("Álbum")) {
                openModal("albumes");
            } else if (text.includes("Personas")) {
                openModal("personas");
            }
        });
    });

    // --- 3. FUNCIONES DEL MODAL ASÍNCRONO ---
    function openModal(mode) {
        currentMode = mode;
        selectedTags = []; // Limpiamos el array temporal
        tagsBox.innerHTML = "";
        newOptionInput.value = "";

        modalSelect.style.display = "block";
        modalLabel.style.display = "block";
        newOptionContainer.classList.add('hidden');

        // Pausar reproducción si el archivo es un vídeo en marcha
        if (typeof isPaused !== 'undefined' && !isPaused) {
            const playPauseBtn = document.getElementById('overlay-toggle');
            if (playPauseBtn) playPauseBtn.click();
        }

        // Configurar títulos de las cabeceras
        if (mode === "albumes") {
            modalTitle.textContent = "Asignar Álbumes";
            modalLabel.textContent = "Selecciona uno o varios álbumes:";
        } else {
            modalTitle.textContent = "Asignar Personas";
            modalLabel.textContent = "Selecciona una o varias personas:";
        }

        if (typeof currentMediaId === 'undefined' || !currentMediaId) {
            console.error("No hay un ID de archivo activo.");
            return;
        }

        // Definimos las dos URLs que necesitamos consultar
        const urlGlobales = mode === "albumes" ? '/api/albumes' : '/api/personas';
        const urlActuales = `/api/pendientes/actuales?archivo_id=${currentMediaId}&tipo=${mode}`;

        // Lanzamos ambas peticiones al mismo tiempo
        Promise.all([
            fetch(urlGlobales).then(res => res.json()),
            fetch(urlActuales).then(res => res.json())
        ])
            .then(([opcionesGlobales, opcionesActuales]) => {
                // 1. Cargamos las que ya tiene asignadas en nuestro array de trabajo
                selectedTags = Array.isArray(opcionesActuales) ? opcionesActuales : [];

                // 2. Pintamos los tags en el tags-box de forma dinámica
                renderTags();

                // 3. Renderizamos el select filtrando lo que ya está en selectedTags
                renderSelectOptions(opcionesGlobales);

                // 4. Mostramos el modal
                modal.classList.remove('hidden-modal');
            })
            .catch(err => {
                console.error("Error en la carga combinada del modal:", err);
                renderSelectOptions([]);
                modal.classList.remove('hidden-modal');
            });
    }

    function closeModal() {
        modal.classList.add('hidden-modal');
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);

    // CORREGIDO: Mapeo seguro del argumento optionsFromBackend
    function renderSelectOptions(optionsFromBackend) {
        modalSelect.innerHTML = "";

        // Nos aseguramos de que sea un array válido para que no rompa el .filter
        const cleanOptions = Array.isArray(optionsFromBackend) ? optionsFromBackend : [];
        const availableOptions = cleanOptions.filter(item => !selectedTags.includes(item));

        if (availableOptions.length === 0) {
            modalSelect.style.display = "none";
            modalLabel.style.display = "none";
            newOptionContainer.classList.remove('hidden');
            newOptionInput.focus();
            return;
        }

        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "-- Seleccione opción --";
        modalSelect.appendChild(defaultOpt);

        availableOptions.forEach(optText => {
            const opt = document.createElement('option');
            opt.value = optText;
            opt.textContent = optText;
            modalSelect.appendChild(opt);
        });

        const addNewOpt = document.createElement('option');
        addNewOpt.value = "__ADD_NEW__";
        addNewOpt.textContent = "➕ Añadir nueva opción...";
        modalSelect.appendChild(addNewOpt);
    }

    modalSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;

        if (val === "__ADD_NEW__") {
            newOptionContainer.classList.remove('hidden');
            newOptionInput.focus();
        } else {
            selectedTags.push(val);
            newOptionContainer.classList.add('hidden');
            renderTags();

            // Volvemos a pedir al servidor para refrescar el select restando la que elegimos
            const endpoint = currentMode === "albumes" ? '/api/albumes' : '/api/personas';
            fetch(endpoint).then(res => res.json()).then(data => renderSelectOptions(data));
        }
    });

    btnAddNewTag.addEventListener('click', () => {
        const value = newOptionInput.value.trim();
        if (!value) return;

        if (!selectedTags.includes(value)) {
            selectedTags.push(value);
        }

        newOptionInput.value = "";
        newOptionContainer.classList.add('hidden');

        const endpoint = currentMode === "albumes" ? '/api/albumes' : '/api/personas';
        fetch(endpoint).then(res => res.json()).then(data => {
            renderTags();
            renderSelectOptions(data);
        });
    });

    function renderTags() {
        tagsBox.innerHTML = "";
        selectedTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = "tag-item";
            tagEl.innerHTML = `${tag} <span class="tag-close" data-tag="${tag}">&times;</span>`;
            tagsBox.appendChild(tagEl);
        });

        const closeButtons = tagsBox.querySelectorAll('.tag-close');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tagToRemove = btn.getAttribute('data-tag');
                selectedTags = selectedTags.filter(t => t !== tagToRemove);

                renderTags();
                const endpoint = currentMode === "albumes" ? '/api/albumes' : '/api/personas';
                fetch(endpoint).then(res => res.json()).then(data => renderSelectOptions(data));
            });
        });
    }

    // --- 4. ACCIÓN DEL BOTÓN ENVIAR ---
    if (btnModalSubmit) {
        console.log("¡Click detectado en el botón Enviar!");
        console.log("Tags seleccionados:", selectedTags);
        btnModalSubmit.addEventListener('click', () => {
            if (selectedTags.length === 0) {
                alert("Selecciona al menos una opción antes de enviar.");
                return;
            }

            if (typeof currentMediaId === 'undefined') {
                console.error("❌ ERROR: La variable 'currentMediaId' NO EXISTE en el entorno global de JS.");
                alert("Error interno: No se encuentra el ID del archivo actual.");
                return;
            }

            if (!currentMediaId) {
                console.error("❌ ERROR: 'currentMediaId' existe pero está VACÍO o es null:", currentMediaId);
                alert("Error interno: El ID del archivo actual está vacío.");
                return;
            }

            console.log("🚀 Todo listo. Enviando datos para el archivo ID:", currentMediaId);

            fetch('/api/pendientes/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    archivo_id: currentMediaId,
                    tipo: currentMode,
                    valores: selectedTags
                })
            })
                .then(res => res.json())
                .then(data => {
                    console.log('server dice: ', data)
                    if (data.status === "success") {
                        closeModal();
                        const msg = currentMode === "albumes" ? "📁 Añadido a álbumes" : "👤 Añadido a personas";
                        showToast(msg);
                    }
                });
        });
    }

    // --- 5. TOASTS NOTIFICATIONS ---
    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = "toast-message";
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => { toast.classList.add('show-toast'); }, 50);
        setTimeout(() => {
            toast.classList.remove('show-toast');
            setTimeout(() => { toast.remove(); }, 300);
        }, 3500);
    }
});