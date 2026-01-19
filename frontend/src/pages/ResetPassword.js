import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Activity, CheckCircle } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      toast.error('Token mancante');
      navigate('/login');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      toast.error('La password deve essere di almeno 6 caratteri');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Le password non corrispondono');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        new_password: newPassword
      });
      setSuccess(true);
      toast.success('Password aggiornata con successo!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore durante il reset della password');
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
          <CardTitle className="text-3xl font-heading font-bold text-primary">
            Reimposta Password
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Inserisci la tua nuova password
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nuova Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  data-testid="new-password-input"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">Minimo 6 caratteri</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Conferma Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  data-testid="confirm-password-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" data-testid="reset-password-button" disabled={loading}>
                {loading ? 'AGGIORNAMENTO...' : 'REIMPOSTA PASSWORD'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="font-heading font-bold text-lg mb-2">Password Aggiornata!</h3>
                <p className="text-sm text-muted-foreground">
                  La tua password è stata aggiornata con successo.
                  Verrai reindirizzato al login...
                </p>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full" data-testid="go-to-login">
                  Vai al Login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
