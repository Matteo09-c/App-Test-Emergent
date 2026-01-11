import requests
import sys
from datetime import datetime, date
import json

class RowingTestAPITester:
    def __init__(self, base_url="https://rowing-tests.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.coach_token = None
        self.athlete_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.coach_user = None
        self.athlete_user = None

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_coach_login(self):
        """Test coach login"""
        success, response = self.run_test(
            "Coach Login",
            "POST",
            "auth/login",
            200,
            data={"email": "coach@retica.it", "password": "coach123"}
        )
        if success and 'token' in response:
            self.coach_token = response['token']
            self.coach_user = response['user']
            print(f"   Coach user: {self.coach_user}")
            return True
        return False

    def test_athlete_login(self):
        """Test athlete login"""
        success, response = self.run_test(
            "Athlete Login",
            "POST",
            "auth/login",
            200,
            data={"email": "lapo@retica.it", "password": "atleta123"}
        )
        if success and 'token' in response:
            self.athlete_token = response['token']
            self.athlete_user = response['user']
            print(f"   Athlete user: {self.athlete_user}")
            return True
        return False

    def test_get_me_coach(self):
        """Test get current user for coach"""
        success, response = self.run_test(
            "Get Coach Profile",
            "GET",
            "auth/me",
            200,
            token=self.coach_token
        )
        return success

    def test_get_me_athlete(self):
        """Test get current user for athlete"""
        success, response = self.run_test(
            "Get Athlete Profile",
            "GET",
            "auth/me",
            200,
            token=self.athlete_token
        )
        return success

    def test_get_users_as_coach(self):
        """Test getting users as coach (should see athletes in same society)"""
        success, response = self.run_test(
            "Get Users as Coach",
            "GET",
            "users",
            200,
            token=self.coach_token
        )
        if success:
            print(f"   Found {len(response)} users")
            for user in response:
                print(f"   - {user.get('name')} ({user.get('email')}) - {user.get('role')}")
        return success

    def test_get_tests_as_coach(self):
        """Test getting tests as coach"""
        success, response = self.run_test(
            "Get Tests as Coach",
            "GET",
            "tests",
            200,
            token=self.coach_token
        )
        if success:
            print(f"   Found {len(response)} tests")
            return response
        return []

    def test_get_tests_as_athlete(self):
        """Test getting tests as athlete"""
        success, response = self.run_test(
            "Get Tests as Athlete",
            "GET",
            "tests",
            200,
            token=self.athlete_token
        )
        if success:
            print(f"   Found {len(response)} tests")
            return response
        return []

    def test_create_test_as_coach(self):
        """Test creating a test as coach for athlete"""
        if not self.athlete_user:
            print("❌ No athlete user available for test creation")
            return False
            
        test_data = {
            "athlete_id": self.athlete_user['id'],
            "date": date.today().isoformat(),
            "distance": 500,
            "time_seconds": 95,
            "strokes": 35,
            "notes": "Test created by coach via API"
        }
        
        success, response = self.run_test(
            "Create Test as Coach",
            "POST",
            "tests",
            200,
            data=test_data,
            token=self.coach_token
        )
        if success:
            print(f"   Created test ID: {response.get('id')}")
            print(f"   Split/500: {response.get('split_500')}")
            print(f"   Watts: {response.get('watts')}")
            return response
        return None

    def test_create_test_as_athlete(self):
        """Test creating a test as athlete"""
        if not self.athlete_user:
            print("❌ No athlete user available for test creation")
            return False
            
        test_data = {
            "athlete_id": self.athlete_user['id'],
            "date": date.today().isoformat(),
            "distance": 1000,
            "time_seconds": 210,
            "strokes": 30,
            "notes": "Test created by athlete via API"
        }
        
        success, response = self.run_test(
            "Create Test as Athlete",
            "POST",
            "tests",
            200,
            data=test_data,
            token=self.athlete_token
        )
        if success:
            print(f"   Created test ID: {response.get('id')}")
            print(f"   Split/500: {response.get('split_500')}")
            print(f"   Watts: {response.get('watts')}")
            return response
        return None

    def test_get_athlete_stats(self):
        """Test getting athlete statistics"""
        if not self.athlete_user:
            print("❌ No athlete user available for stats")
            return False
            
        success, response = self.run_test(
            "Get Athlete Stats",
            "GET",
            f"tests/athlete/{self.athlete_user['id']}/stats",
            200,
            token=self.coach_token
        )
        if success:
            print(f"   Total tests: {response.get('tests_count')}")
            stats = response.get('stats', {})
            for distance, data in stats.items():
                print(f"   {distance}: Best time {data['best']['time_seconds']}s, {data['count']} tests")
        return success

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        success, response = self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data={"email": "invalid@test.com", "password": "wrongpass"}
        )
        return success

    def test_unauthorized_access(self):
        """Test accessing protected endpoint without token"""
        success, response = self.run_test(
            "Unauthorized Access",
            "GET",
            "auth/me",
            401
        )
        return success

def main():
    print("🚣 Starting Rowing Test Management API Tests")
    print("=" * 60)
    
    tester = RowingTestAPITester()
    
    # Test authentication
    print("\n📋 AUTHENTICATION TESTS")
    if not tester.test_coach_login():
        print("❌ Coach login failed, stopping tests")
        return 1
        
    if not tester.test_athlete_login():
        print("❌ Athlete login failed, stopping tests")
        return 1

    # Test profile access
    print("\n👤 PROFILE TESTS")
    tester.test_get_me_coach()
    tester.test_get_me_athlete()

    # Test user management
    print("\n👥 USER MANAGEMENT TESTS")
    tester.test_get_users_as_coach()

    # Test existing tests
    print("\n📊 TEST DATA RETRIEVAL")
    existing_coach_tests = tester.test_get_tests_as_coach()
    existing_athlete_tests = tester.test_get_tests_as_athlete()

    # Test creating new tests
    print("\n➕ TEST CREATION")
    coach_created_test = tester.test_create_test_as_coach()
    athlete_created_test = tester.test_create_test_as_athlete()

    # Test statistics
    print("\n📈 STATISTICS TESTS")
    tester.test_get_athlete_stats()

    # Test security
    print("\n🔒 SECURITY TESTS")
    tester.test_invalid_login()
    tester.test_unauthorized_access()

    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("✅ All API tests passed!")
        return 0
    else:
        print(f"❌ {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())