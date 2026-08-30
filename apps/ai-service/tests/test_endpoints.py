from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "codeguard-ai-service"
    assert "circuitBreaker" in data
    assert "cache" in data


def test_security_analysis_endpoint():
    payload = {
        "language": "python",
        "code": "def process_data(cmd):\n    import os\n    eval(cmd)",
        "mode": "expert",
        "repositoryContext": {
            "name": "my-repo",
            "branch": "main",
            "commitSha": "abc1234"
        }
    }
    response = client.post("/security-analysis", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "scores" in data
    assert 0 <= data["scores"]["overallScore"] <= 100
    assert 0 <= data["scores"]["securityScore"] <= 100
    assert isinstance(data["findings"], list)
    assert len(data["findings"]) > 0


def test_repository_analysis_endpoint():
    payload = {
        "language": "typescript",
        "code": "export class UserService { async getUser() { return db.users.findMany(); } }",
        "mode": "intermediate"
    }
    response = client.post("/repository-analysis", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "scores" in data
    assert isinstance(data["findings"], list)


def test_documentation_generator_endpoint():
    payload = {
        "language": "javascript",
        "code": "function calculateTotal(items) { return items.reduce((acc, item) => acc + item.price, 0); }",
        "mode": "beginner"
    }
    response = client.post("/documentation-generator", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "scores" in data
    assert data["generatedMarkdown"] is not None
    assert "# " in data["generatedMarkdown"]


def test_interview_generator_endpoint():
    payload = {
        "language": "java",
        "code": "public class LRUCache { private Map<Integer, Integer> map; }",
        "mode": "expert"
    }
    response = client.post("/interview-generator", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "scores" in data
    assert data["generatedMarkdown"] is not None


def test_validation_error_on_invalid_language():
    payload = {
        "language": "",
        "code": "print('hello')"
    }
    response = client.post("/security-analysis", json=payload)
    assert response.status_code == 422
