import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export const api = axios.create({
  baseURL: API_URL
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Societies
export const getSocieties = () => api.get('/societies');
export const createSociety = (data) => api.post('/societies', data);

// Users
export const getUsers = () => api.get('/users');
export const getUser = (userId) => api.get(`/users/${userId}`);

// Tests
export const getTests = (athleteId = null) => {
  const params = athleteId ? { athlete_id: athleteId } : {};
  return api.get('/tests', { params });
};
export const createTest = (data) => api.post('/tests', data);
export const getAthleteStats = (athleteId) => api.get(`/tests/athlete/${athleteId}/stats`);

// Utils
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
};

export const formatSplit = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};