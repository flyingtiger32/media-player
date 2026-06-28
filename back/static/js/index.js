document.addEventListener('DOMContentLoaded', () => {
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