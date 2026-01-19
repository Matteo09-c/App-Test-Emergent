import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Activity, ArrowLeft, Mail } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setSent(true);
      toast.success('Email inviata! Controlla la tua casella di posta.');
    } catch (error) {
      toast.error('Errore durante l\'invio dell\'email');
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
            Password Dimenticata
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Inserisci la tua email per ricevere il link di reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="forgot-email-input"
                  placeholder="tua@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" data-testid="send-reset-button" disabled={loading}>
                <Mail className="h-4 w-4 mr-2" />
                {loading ? 'INVIO...' : 'INVIA LINK DI RESET'}
              </Button>
              <div className="text-center">
                <Link to="/login" className="text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-2" data-testid="back-to-login">
                  <ArrowLeft className="h-4 w-4" />
                  Torna al login
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="font-heading font-bold text-lg mb-2">Email Inviata!</h3>
                <p className="text-sm text-muted-foreground">
                  Se l'email esiste nel nostro sistema, riceverai un link per reimpostare la password.
                  Controlla la tua casella di posta.
                </p>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full" data-testid="return-to-login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Torna al Login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
