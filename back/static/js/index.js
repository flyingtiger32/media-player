document.addEventListener('DOMContentLoaded', () => {

    const btnTriggerNav = document.getElementById('btn-trigger-nav-modal'); // Asigna este ID al botón "personas y álbumes" de tu landing
    const navModal = document.getElementById('nav-modal');
    const navModalClose = document.getElementById('nav-modal-close');

    if (btnTriggerNav && navModal) {
        btnTriggerNav.addEventListener('click', (e) => {
            e.preventDefault();
            navModal.classList.remove('hidden-modal');
        });
    }

    if (navModalClose && navModal) {
        navModalClose.addEventListener('click', () => {
            navModal.classList.add('hidden-modal');
        });
    }

    if (navModal) {
        navModal.addEventListener('click', (e) => {
            if (e.target === navModal) {
                navModal.classList.add('hidden-modal');
            }
        });
    }

    fetch('/api/stats/pendientes')
        .then(res => res.json())
        .then(data => {
            const spanCount = document.getElementById('count-pendientes');
            if (spanCount) {
                spanCount.textContent = `(${data.total_pendientes})`;
            }
        })
        .catch(err => console.error("Error cargando pendientes:", err));
});