document.addEventListener('DOMContentLoaded', () => {
    const btnOptions = document.getElementById('btn-options');
    const optionsDropdown = document.getElementById('options-dropdown');

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

    let dbMock = {
        albumes: ["Vacaciones 2025", "Gimnasio", "Coche Nuevo", "Familia"],
        personas: ["Padre", "Marta", "Carlos", "Hades66"]
    };
    let currentMode = ""; // "albumes" o "personas"
    let selectedTags = []; // Almacena los strings elegidos por el usuario

    if (btnOptions && optionsDropdown) {
        btnOptions.addEventListener('click', (e) => {
            // Evitamos que el click se propague (por si afecta a la pausa del reproductor)
            e.stopPropagation();

            // Alternamos la clase de ocultado del menú
            optionsDropdown.classList.toggle('hidden-menu');

            // Opcional: dejamos el botón azulito mientras el menú esté abierto
            btnOptions.classList.toggle('active-trigger');
        });

        document.addEventListener('click', (e) => {
            if (!optionsDropdown.classList.contains('hidden-menu') && !btnOptions.contains(e.target)) {
                optionsDropdown.add('hidden-menu');
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
                showToast("⭐ Añadido a favoritos");
            } else if (text.includes("Álbum")) {
                openModal("albumes");
            } else if (text.includes("Personas")) {
                openModal("personas");
            }
        });
    });

    // --- 3. FUNCIONES DEL MODAL ---
    function openModal(mode) {
        currentMode = mode;
        selectedTags = []; // Reset de seleccionados anterior
        tagsBox.innerHTML = ""; // Limpiar visualmente la caja de tags
        newOptionInput.value = ""; // Reset del input manual
        newOptionContainer.classList.add('hidden'); // Ocultar input manual al inicio

        // Pausar reproducción si existe la variable global del reproductor
        if (typeof isPaused !== 'undefined' && !isPaused) {
            // Simulamos o ejecutamos el click en el botón de pausar central
            const playPauseBtn = document.getElementById('overlay-toggle');
            if (playPauseBtn) playPauseBtn.click();
        }

        // Tunear textos del modal según el modo elegido
        if (mode === "albumes") {
            modalTitle.textContent = "Asignar Álbumes";
            modalLabel.textContent = "Selecciona uno o varios álbumes:";
        } else {
            modalTitle.textContent = "Asignar Personas";
            modalLabel.textContent = "Selecciona una o varias personas:";
        }

        // Cargar las opciones en el Select
        renderSelectOptions();

        // Mostrar el modal quitando la clase oculta
        modal.classList.remove('hidden-modal');
    }

    function closeModal() {
        modal.classList.add('hidden-modal');
    }

    modalClose.addEventListener('click', closeModal);

    // Renderizar las opciones disponibles filtrando las que ya se seleccionaron
    function renderSelectOptions() {
        modalSelect.innerHTML = "";

        // Añadimos option inicial por defecto
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "-- Selecciona una opción --";
        modalSelect.appendChild(defaultOpt);

        // Sacamos la lista completa según el modo y filtramos las que ya están como tags
        const fullList = dbMock[currentMode];
        const availableOptions = fullList.filter(item => !selectedTags.includes(item));

        availableOptions.forEach(optText => {
            const opt = document.createElement('option');
            opt.value = optText;
            opt.textContent = optText;
            modalSelect.appendChild(opt);
        });

        // Opción final obligatoria para crear una nueva
        const addNewOpt = document.createElement('option');
        addNewOpt.value = "__ADD_NEW__";
        addNewOpt.textContent = "➕ Añadir nueva opción...";
        modalSelect.appendChild(addNewOpt);
    }

    // Escuchar cambios en el Select
    modalSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;

        if (val === "__ADD_NEW__") {
            // Mostrar la cajita con el input de texto libre
            newOptionContainer.classList.remove('hidden');
        } else {
            // Añadir el string al array de seleccionados
            selectedTags.push(val);
            newOptionContainer.classList.add('hidden');
            renderTags();
            renderSelectOptions(); // Rebarajamos el select para que desaparezca la opción elegida
        }
    });

    // Añadir una nueva opción introducida manualmente por teclado
    btnAddNewTag.addEventListener('click', () => {
        const value = newOptionInput.value.trim();
        if (!value) return;

        // Si no existe en nuestro mock de base de datos local, la inyectamos para que persista en el select
        if (!dbMock[currentMode].includes(value)) {
            dbMock[currentMode].push(value);
        }

        // La seleccionamos directamente
        if (!selectedTags.includes(value)) {
            selectedTags.push(value);
        }

        newOptionInput.value = "";
        newOptionContainer.classList.add('hidden');
        renderTags();
        renderSelectOptions();
    });

    // Pintar los tags seleccionados dentro de la caja negra inferior
    function renderTags() {
        tagsBox.innerHTML = "";
        selectedTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = "tag-item";
            tagEl.innerHTML = `
                ${tag}
                <span class="tag-close" data-tag="${tag}">&times;</span>
            `;
            tagsBox.appendChild(tagEl);
        });

        // Escuchar los clics en las 'x' para remover los tags
        const closeButtons = tagsBox.querySelectorAll('.tag-close');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tagToRemove = btn.getAttribute('data-tag');
                // Lo filtramos para sacarlo del array activo
                selectedTags = selectedTags.filter(t => t !== tagToRemove);

                renderTags();
                renderSelectOptions(); // Vuelve a aparecer mágicamente en el select
            });
        });
    }

    // --- 4. ACCIÓN DEL BOTÓN ENVIAR ---
    btnModalSubmit.addEventListener('click', () => {
        if (selectedTags.length === 0) {
            alert("Selecciona al menos una opción antes de enviar.");
            return;
        }

        // Cerramos el modal
        closeModal();

        // Lanzamos el toast dinámico
        const msg = currentMode === "albumes"
            ? "📁 Añadido correctamente a álbumes"
            : "👤 Añadido correctamente a personas";
        showToast(msg);
    });

    // --- 5. MOTOR DINÁMICO DE TOAST NOTIFICATIONS ---
    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = "toast-message";
        toast.textContent = message;

        container.appendChild(toast);

        // Forzamos un reflow sutil para la transición de entrada (fade in + subida)
        setTimeout(() => {
            toast.classList.add('show-toast');
        }, 50);

        // Programamos el desvanecimiento y borrado a los 3.5 segundos
        setTimeout(() => {
            toast.classList.remove('show-toast');
            setTimeout(() => {
                toast.remove();
            }, 300); // Espera que acabe la transición de salida antes de destruir el nodo
        }, 3500);
    }
});