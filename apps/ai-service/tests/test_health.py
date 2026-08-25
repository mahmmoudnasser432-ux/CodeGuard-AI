from fastapi.testclient import TestClient
from app.main import app


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
    assert "gemini" in data
    assert "circuitBreaker" in data
    assert "state" in data["circuitBreaker"]
    assert "cache" in data
    assert "connected" in data["cache"]
