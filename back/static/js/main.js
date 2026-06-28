document.addEventListener('DOMContentLoaded', () => {
    checkBackendHealth();
});

async function checkBackendHealth() {
    const statusContainer = document.getElementById('health-status');
    const statusText = document.getElementById('status-text');

    try {
        const response = await fetch('http://127.0.0.1:5000/api/health');
        
        if (response.ok) {
            statusContainer.className = 'status-indicator online';
            statusText.textContent = 'Servidor Activo';
        } else {
            throw new Error('Backend respondiendo con error');
        }
    } catch (error) {
        statusContainer.className = 'status-indicator offline';
        statusText.textContent = 'Servidor Desconectado';
        console.error('Error de conexión:', error);
    }
}