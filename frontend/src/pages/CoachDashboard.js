import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { LogOut, Plus, Users, Activity, TrendingUp, UserCheck, UserX, ArrowRightLeft } from 'lucide-react';
import { getUsers, getTests, createTest, getSocieties, createSociety, getPendingUsers, approveUser, rejectUser, getSocietyChangeRequests, approveSocietyChange } from '../utils/api';
import { formatTime, formatSplit } from '../utils/api';

export default function CoachDashboard() {
  const { user, logout, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [tests, setTests] = useState([]);
  const [societies, setSocieties] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [societyChangeRequests, setSocietyChangeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showSocietyDialog, setShowSocietyDialog] = useState(false);
  const [testData, setTestData] = useState({
    athlete_id: '',
    date: new Date().toISOString().split('T')[0],
    distance: '',
    time_seconds: '',
    strokes: '',
    weight: '',
    height: '',
    notes: ''
  });
  const [societyName, setSocietyName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, testsRes, societiesRes, pendingRes, changeReqRes] = await Promise.all([
        getUsers(),
        getTests(),
        getSocieties(),
        getPendingUsers().catch(() => ({ data: [] })),
        getSocietyChangeRequests().catch(() => ({ data: [] }))
      ]);
      setAthletes(usersRes.data.filter(u => u.role === 'athlete' && u.status === 'approved'));
      setTests(testsRes.data);
      setSocieties(societiesRes.data);
      setPendingUsers(pendingRes.data);
      setSocietyChangeRequests(changeReqRes.data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTest = async (e) => {
    e.preventDefault();
    try {
      await createTest({
        ...testData,
        distance: parseFloat(testData.distance),
        time_seconds: parseFloat(testData.time_seconds),
        strokes: testData.strokes ? parseInt(testData.strokes) : null,
        weight: testData.weight ? parseFloat(testData.weight) : null,
        height: testData.height ? parseFloat(testData.height) : null
      });
      toast.success('Test aggiunto con successo!');
      setShowTestDialog(false);
      loadData();
      setTestData({
        athlete_id: '',
        date: new Date().toISOString().split('T')[0],
        distance: '',
        time_seconds: '',
        strokes: '',
        weight: '',
        height: '',
        notes: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore durante la creazione del test');
    }
  };

  const handleCreateSociety = async (e) => {
    e.preventDefault();
    try {
      await createSociety({ name: societyName });
      toast.success('Società creata con successo!');
      setShowSocietyDialog(false);
      setSocietyName('');
      loadData();
    } catch (error) {
      toast.error('Errore durante la creazione della società');
    }
  };

  const athleteStats = athletes.map(athlete => {
    const athleteTests = tests.filter(t => t.athlete_id === athlete.id);
    return {
      ...athlete,
      testsCount: athleteTests.length,
      lastTest: athleteTests.length > 0 ? athleteTests[0].date : null
    };
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-primary text-xl font-mono">CARICAMENTO...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-slate-800 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-heading font-bold text-primary">ROWING TESTS</h1>
                <p className="text-sm text-muted-foreground">Dashboard Coach - {user?.name}</p>
              </div>
            </div>
            <Button variant="outline" onClick={logout} data-testid="logout-button">
              <LogOut className="h-4 w-4 mr-2" />
              Esci
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Atleti Totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-primary">{athletes.length}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Test Totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-secondary">{tests.length}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Società</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono">{societies.length}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Azioni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full" data-testid="add-test-button">
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Test
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Nuovo Test</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateTest} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Atleta</Label>
                      <Select value={testData.athlete_id} onValueChange={(value) => setTestData({...testData, athlete_id: value})} required>
                        <SelectTrigger data-testid="test-athlete-select">
                          <SelectValue placeholder="Seleziona atleta" />
                        </SelectTrigger>
                        <SelectContent>
                          {athletes.map(athlete => (
                            <SelectItem key={athlete.id} value={athlete.id}>{athlete.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input type="date" data-testid="test-date-input" value={testData.date} onChange={(e) => setTestData({...testData, date: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Distanza (m)</Label>
                        <Input type="number" data-testid="test-distance-input" placeholder="2000" value={testData.distance} onChange={(e) => setTestData({...testData, distance: e.target.value})} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Tempo (sec)</Label>
                        <Input type="number" step="0.1" data-testid="test-time-input" placeholder="420" value={testData.time_seconds} onChange={(e) => setTestData({...testData, time_seconds: e.target.value})} required />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Colpi</Label>
                        <Input type="number" data-testid="test-strokes-input" placeholder="30" value={testData.strokes} onChange={(e) => setTestData({...testData, strokes: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Peso (kg)</Label>
                        <Input type="number" step="0.1" data-testid="test-weight-input" placeholder="75" value={testData.weight} onChange={(e) => setTestData({...testData, weight: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Altezza (cm)</Label>
                        <Input type="number" data-testid="test-height-input" placeholder="180" value={testData.height} onChange={(e) => setTestData({...testData, height: e.target.value})} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Note</Label>
                      <Input data-testid="test-notes-input" placeholder="Note aggiuntive..." value={testData.notes} onChange={(e) => setTestData({...testData, notes: e.target.value})} />
                    </div>
                    <Button type="submit" className="w-full" data-testid="test-submit-button">Crea Test</Button>
                  </form>
                </DialogContent>
              </Dialog>
              {user?.role === 'super_admin' && (
                <Dialog open={showSocietyDialog} onOpenChange={setShowSocietyDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full" data-testid="add-society-button">
                      <Plus className="h-4 w-4 mr-2" />
                      Nuova Società
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuova Società</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateSociety} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nome Società</Label>
                        <Input data-testid="society-name-input" placeholder="Nome società" value={societyName} onChange={(e) => setSocietyName(e.target.value)} required />
                      </div>
                      <Button type="submit" className="w-full" data-testid="society-submit-button">Crea Società</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Athletes Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Atleti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="athletes-table">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">NOME</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">CATEGORIA</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">TEST</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">ULTIMO TEST</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">AZIONI</th>
                  </tr>
                </thead>
                <tbody>
                  {athleteStats.map((athlete) => (
                    <tr key={athlete.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" data-testid={`athlete-row-${athlete.id}`}>
                      <td className="p-3 font-medium">{athlete.name}</td>
                      <td className="p-3 text-muted-foreground">{athlete.category || '-'}</td>
                      <td className="p-3 font-mono text-primary">{athlete.testsCount}</td>
                      <td className="p-3 font-mono text-sm">{athlete.lastTest || '-'}</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/athlete/${athlete.id}`)} data-testid={`view-athlete-${athlete.id}`}>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Vedi Profilo
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {athleteStats.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-muted-foreground">
                        Nessun atleta trovato
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}