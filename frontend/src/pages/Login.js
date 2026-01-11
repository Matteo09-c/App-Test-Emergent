import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Activity } from 'lucide-react';
import { getSocieties } from '../utils/api';
import { useEffect } from 'react';

export default function Login() {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'athlete',
    society_id: '',
    category: '',
    weight: '',
    height: ''
  });
  const [societies, setSocieties] = useState([]);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSocieties();
  }, []);

  const loadSocieties = async () => {
    try {
      const response = await getSocieties();
      setSocieties(response.data);
    } catch (error) {
      console.error('Failed to load societies:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(loginEmail, loginPassword);
      toast.success('Login effettuato con successo!');
      navigate(user.role === 'athlete' ? '/athlete' : '/coach');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore durante il login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...registerData,
        weight: registerData.weight ? parseFloat(registerData.weight) : null,
        height: registerData.height ? parseFloat(registerData.height) : null
      };
      const user = await register(data);
      toast.success('Registrazione completata!');
      navigate(user.role === 'athlete' ? '/athlete' : '/coach');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore durante la registrazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      backgroundImage: 'url(https://images.unsplash.com/photo-1559819810-5036f57a9e8b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxyb3dpbmclMjBjcmV3JTIwc3Vuc2V0fGVufDB8fHx8MTc2ODE2NDIxMnww&ixlib=rb-4.1.0&q=85)',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" />
      
      <Card className="w-full max-w-md relative z-10 glassmorphism border-slate-800">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-heading font-bold text-primary">ROWING TESTS</CardTitle>
          <CardDescription className="text-muted-foreground">Gestione Test di Canottaggio</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab">Registrati</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    data-testid="login-email-input"
                    placeholder="tua@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    data-testid="login-password-input"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="login-submit-button" disabled={loading}>
                  {loading ? 'ACCESSO...' : 'ACCEDI'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Nome Completo</Label>
                  <Input
                    id="register-name"
                    data-testid="register-name-input"
                    placeholder="Mario Rossi"
                    value={registerData.name}
                    onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    data-testid="register-email-input"
                    placeholder="tua@email.com"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    data-testid="register-password-input"
                    placeholder="••••••••"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-role">Ruolo</Label>
                  <Select value={registerData.role} onValueChange={(value) => setRegisterData({...registerData, role: value})}>
                    <SelectTrigger data-testid="register-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="athlete">Atleta</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {registerData.role !== 'super_admin' && (
                  <div className="space-y-2">
                    <Label htmlFor="register-society">Società</Label>
                    <Select value={registerData.society_id} onValueChange={(value) => setRegisterData({...registerData, society_id: value})}>
                      <SelectTrigger data-testid="register-society-select">
                        <SelectValue placeholder="Seleziona società" />
                      </SelectTrigger>
                      <SelectContent>
                        {societies.map((society) => (
                          <SelectItem key={society.id} value={society.id}>{society.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {registerData.role === 'athlete' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-weight">Peso (kg)</Label>
                        <Input
                          id="register-weight"
                          type="number"
                          step="0.1"
                          data-testid="register-weight-input"
                          placeholder="70"
                          value={registerData.weight}
                          onChange={(e) => setRegisterData({...registerData, weight: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-height">Altezza (cm)</Label>
                        <Input
                          id="register-height"
                          type="number"
                          data-testid="register-height-input"
                          placeholder="180"
                          value={registerData.height}
                          onChange={(e) => setRegisterData({...registerData, height: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-category">Categoria</Label>
                      <Input
                        id="register-category"
                        data-testid="register-category-input"
                        placeholder="es. RAGAZZI 1°, JUNIOR 2°"
                        value={registerData.category}
                        onChange={(e) => setRegisterData({...registerData, category: e.target.value})}
                      />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full" data-testid="register-submit-button" disabled={loading}>
                  {loading ? 'REGISTRAZIONE...' : 'REGISTRATI'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}