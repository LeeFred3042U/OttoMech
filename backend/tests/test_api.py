import pytest
from app import create_app
from db import init_db

@pytest.fixture(scope="session")
def app():
    # Setup test app
    app = create_app()
    app.config.update({
        "TESTING": True,
    })
    
    # Initialize DB (using existing logic, make sure test DB URL is set if we want isolated tests, 
    # but for basic testing here we can just test the app factory and simple routes)
    # init_db()  # Not resetting DB in tests to avoid destroying dev data
    
    yield app

@pytest.fixture()
def client(app):
    return app.test_client()

def test_index_route(client):
    response = client.get('/')
    assert response.status_code == 200

def test_mechanics_available(client):
    response = client.get('/mechanics/available')
    assert response.status_code == 200
    data = response.get_json()
    assert "count" in data
    assert "mechanics" in data
    assert type(data["mechanics"]) is list

def test_push_vapid_key(client):
    response = client.get('/push/vapid-public-key')
    assert response.status_code == 200
    data = response.get_json()
    assert "public_key" in data
