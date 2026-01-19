import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { LogOut, Plus, Activity, TrendingUp, Award, ArrowRightLeft } from 'lucide-react';
import { getTests, createTest, getAthleteStats, getSocieties, requestSocietyChange } from '../utils/api';
import { formatTime, formatSplit } from '../utils/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AthleteDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [stats, setStats] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showSocietyChangeDialog, setShowSocietyChangeDialog] = useState(false);
  const [selectedNewSociety, setSelectedNewSociety] = useState('');
  const [testData, setTestData] = useState({
    date: new Date().toISOString().split('T')[0],
    distance: '',
    time_seconds: '',
    strokes: '',
    weight: '',
    height: '',
    notes: ''
  });

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [testsRes, statsRes, societiesRes] = await Promise.all([
        getTests(user.id),
        getAthleteStats(user.id),
        getSocieties()
      ]);
      setTests(testsRes.data);
      setStats(statsRes.data);
      setSocieties(societiesRes.data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSocietyChange = async () => {
    if (!selectedNewSociety) {
      toast.error('Seleziona una società');
      return;
    }
    try {
      await requestSocietyChange(user.id, selectedNewSociety);
      toast.success('Richiesta di cambio società inviata! Attendi l\'approvazione di un coach.');
      setShowSocietyChangeDialog(false);
      setSelectedNewSociety('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore durante la richiesta');
    }
  };

  const handleCreateTest = async (e) => {
    e.preventDefault();
    try {
      await createTest({
        athlete_id: user.id,
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

  // Prepare chart data
  const chartData = tests
    .filter(t => t.distance === 2000)
    .slice(0, 10)
    .reverse()
    .map(t => ({
      date: new Date(t.date).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
      watts: t.watts,
      split: t.split_500
    }));

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
                <p className="text-sm text-muted-foreground">Dashboard - {user?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/athlete/${user.id}`)} data-testid="view-profile-button">
                <TrendingUp className="h-4 w-4 mr-2" />
                Profilo Completo
              </Button>
              <Button variant="outline" onClick={logout} data-testid="logout-button">
                <LogOut className="h-4 w-4 mr-2" />
                Esci
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Test Totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-primary">{stats?.tests_count || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Miglior 2000m</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-secondary">
                {stats?.stats?.['2000m']?.best ? formatTime(stats.stats['2000m'].best.time_seconds) : '-'}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Miglior Watt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {stats?.stats?.['2000m']?.best ? Math.round(stats.stats['2000m'].best.watts) : '-'} W
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Azioni</CardTitle>
            </CardHeader>
            <CardContent>
              <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full" data-testid="add-test-button">
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Test
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nuovo Test</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateTest} className="space-y-4">
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
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card className="border-slate-800 mb-8">
            <CardHeader>
              <CardTitle>Progressione 2000m - Watts</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px'
                    }}
                  />
                  <Line type="monotone" dataKey="watts" stroke="#38BDF8" strokeWidth={3} dot={{ fill: '#38BDF8', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tests Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              I Miei Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="tests-table">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">DATA</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">DISTANZA</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">TEMPO</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">SPLIT/500</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">WATTS</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">COLPI</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => (
                    <tr key={test.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" data-testid={`test-row-${test.id}`}>
                      <td className="p-3 font-mono text-sm">{new Date(test.date).toLocaleDateString('it-IT')}</td>
                      <td className="p-3 font-mono text-primary">{test.distance}m</td>
                      <td className="p-3 font-mono">{formatTime(test.time_seconds)}</td>
                      <td className="p-3 font-mono text-secondary">{formatSplit(test.split_500)}</td>
                      <td className="p-3 font-mono font-bold">{Math.round(test.watts)} W</td>
                      <td className="p-3 font-mono text-muted-foreground">{test.strokes || '-'}</td>
                    </tr>
                  ))}
                  {tests.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-muted-foreground">
                        Nessun test trovato. Aggiungi il tuo primo test!
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