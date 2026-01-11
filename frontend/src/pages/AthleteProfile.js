import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Activity, TrendingUp, Zap, Target } from 'lucide-react';
import { getUser, getAthleteStats } from '../utils/api';
import { formatTime, formatSplit } from '../utils/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [athleteId]);

  const loadData = async () => {
    try {
      const [athleteRes, statsRes] = await Promise.all([
        getUser(athleteId),
        getAthleteStats(athleteId)
      ]);
      setAthlete(athleteRes.data);
      setStats(statsRes.data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  // Calculate predictions and zones based on best 2000m test
  const calculate2000mMetrics = () => {
    if (!stats?.stats?.['2000m']?.best) return null;

    const best2k = stats.stats['2000m'].best;
    const watts2k = best2k.watts;
    
    // Prediction formulas (simplified)
    const predict100m = {
      watts: watts2k * 1.75,
      time: 18.5
    };
    
    const predict60sec = {
      meters: 320,
      watts: watts2k * 1.59
    };
    
    const predict6000m = {
      watts: watts2k * 0.86,
      time: best2k.time_seconds * 3.15
    };

    // Training zones (percentage of 2k watts)
    const zones = {
      ut2: { min: watts2k * 0.55, max: watts2k * 0.65, name: 'UT2 (Aerobico Base)' },
      ut1: { min: watts2k * 0.65, max: watts2k * 0.75, name: 'UT1 (Aerobico)' },
      at: { min: watts2k * 0.75, max: watts2k * 0.85, name: 'AT (Soglia Anaerobica)' },
      tr: { min: watts2k * 0.85, max: watts2k * 0.95, name: 'TR (Trasformazione)' },
      an: { min: watts2k * 0.95, max: watts2k * 1.05, name: 'AN (Anaerobico)' }
    };

    return {
      real2k: best2k,
      predictions: {
        '100m': predict100m,
        '60sec': predict60sec,
        '6000m': predict6000m
      },
      zones
    };
  };

  const metrics = calculate2000mMetrics();

  // Prepare progression chart data
  const progressionData = stats?.all_tests
    ?.filter(t => t.distance === 2000)
    ?.sort((a, b) => new Date(a.date) - new Date(b.date))
    ?.map(t => ({
      date: new Date(t.date).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
      watts: Math.round(t.watts),
      split: t.split_500,
      time: t.time_seconds
    })) || [];

  // Prepare distance comparison
  const distanceStats = Object.entries(stats?.stats || {}).map(([distance, data]) => ({
    distance: distance.replace('m', ''),
    bestWatts: Math.round(data.best.watts),
    latestWatts: Math.round(data.latest.watts)
  }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-primary text-xl font-mono">CARICAMENTO...</div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-destructive text-xl">Atleta non trovato</div>
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
              <Button variant="ghost" onClick={() => navigate(-1)} data-testid="back-button">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-heading font-bold">{athlete.name}</h1>
                <p className="text-sm text-muted-foreground">{athlete.category || 'Atleta'}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Athlete Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-8 lg:grid-cols-12 gap-6 mb-8">
          {/* Profile Info */}
          <Card className="border-slate-800 md:col-span-4 lg:col-span-4">
            <CardHeader>
              <CardTitle className="text-lg">Dati Atleta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso:</span>
                <span className="font-mono font-bold">{athlete.weight ? `${athlete.weight} kg` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Altezza:</span>
                <span className="font-mono font-bold">{athlete.height ? `${athlete.height} cm` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-mono font-bold">{athlete.category || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Test Totali:</span>
                <span className="font-mono font-bold text-primary">{stats?.tests_count || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* 2000m Best */}
          {metrics && (
            <>
              <Card className="border-slate-800 md:col-span-4 lg:col-span-4 bg-gradient-to-br from-primary/10 to-transparent">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Miglior 2000m
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tempo:</span>
                    <span className="font-mono font-bold text-2xl text-primary">{formatTime(metrics.real2k.time_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Split/500:</span>
                    <span className="font-mono font-bold text-lg text-secondary">{formatSplit(metrics.real2k.split_500)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Watts:</span>
                    <span className="font-mono font-bold text-xl">{Math.round(metrics.real2k.watts)} W</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Data:</span>
                    <span className="font-mono">{new Date(metrics.real2k.date).toLocaleDateString('it-IT')}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-800 md:col-span-4 lg:col-span-4">
                <CardHeader>
                  <CardTitle className="text-lg">Record Personali</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(stats?.stats || {}).slice(0, 3).map(([distance, data]) => (
                    <div key={distance} className="flex justify-between items-center py-1 border-b border-slate-800/50">
                      <span className="font-mono text-sm text-muted-foreground">{distance}:</span>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold">{formatTime(data.best.time_seconds)}</div>
                        <div className="font-mono text-xs text-primary">{Math.round(data.best.watts)} W</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Predictions Section */}
        {metrics && (
          <Card className="border-slate-800 mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Previsioni Performance (basate su 2000m)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <h3 className="font-heading font-bold text-lg text-primary">100 metri</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Tempo previsto:</span>
                      <span className="font-mono font-bold">{metrics.predictions['100m'].time}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Watts previsti:</span>
                      <span className="font-mono font-bold text-secondary">{Math.round(metrics.predictions['100m'].watts)} W</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-heading font-bold text-lg text-primary">60 secondi</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Metri previsti:</span>
                      <span className="font-mono font-bold">{Math.round(metrics.predictions['60sec'].meters)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Watts previsti:</span>
                      <span className="font-mono font-bold text-secondary">{Math.round(metrics.predictions['60sec'].watts)} W</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-heading font-bold text-lg text-primary">6000 metri</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Tempo previsto:</span>
                      <span className="font-mono font-bold">{formatTime(metrics.predictions['6000m'].time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Watts previsti:</span>
                      <span className="font-mono font-bold text-secondary">{Math.round(metrics.predictions['6000m'].watts)} W</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Training Zones */}
        {metrics && (
          <Card className="border-slate-800 mb-8">
            <CardHeader>
              <CardTitle>Zone di Allenamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(metrics.zones).map(([key, zone]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-heading font-bold">{zone.name}</span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {Math.round(zone.min)} - {Math.round(zone.max)} W
                      </span>
                    </div>
                    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          key === 'ut2' ? 'bg-chart-3' :
                          key === 'ut1' ? 'bg-secondary' :
                          key === 'at' ? 'bg-chart-4' :
                          key === 'tr' ? 'bg-chart-5' :
                          'bg-destructive'
                        }`}
                        style={{ 
                          width: `${((zone.max - zone.min) / (metrics.zones.an.max - metrics.zones.ut2.min)) * 100}%`,
                          marginLeft: `${((zone.min - metrics.zones.ut2.min) / (metrics.zones.an.max - metrics.zones.ut2.min)) * 100}%`
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-mono text-muted-foreground">
                      <span>Split/500: {formatSplit((2.8 / (zone.min / 1000)) ** (1/3) * 500)}</span>
                      <span>Split/500: {formatSplit((2.8 / (zone.max / 1000)) ** (1/3) * 500)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progression Charts */}
        {progressionData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Progressione Watts (2000m)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={progressionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
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

            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Confronto Distanze (Miglior Watt)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={distanceStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="distance" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="bestWatts" fill="#38BDF8" name="Miglior" />
                    <Bar dataKey="latestWatts" fill="#FACC15" name="Ultimo" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* All Tests Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle>Storico Test Completo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="all-tests-table">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">DATA</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">DISTANZA</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">TEMPO</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">SPLIT/500</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">WATTS</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">W/KG</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">COLPI</th>
                    <th className="text-left p-3 font-mono text-sm text-muted-foreground">NOTE</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.all_tests?.map((test) => (
                    <tr key={test.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono text-sm">{new Date(test.date).toLocaleDateString('it-IT')}</td>
                      <td className="p-3 font-mono text-primary">{test.distance}m</td>
                      <td className="p-3 font-mono">{formatTime(test.time_seconds)}</td>
                      <td className="p-3 font-mono text-secondary">{formatSplit(test.split_500)}</td>
                      <td className="p-3 font-mono font-bold">{Math.round(test.watts)} W</td>
                      <td className="p-3 font-mono text-sm">{test.watts_per_kg ? test.watts_per_kg.toFixed(2) : '-'}</td>
                      <td className="p-3 font-mono text-muted-foreground">{test.strokes || '-'}</td>
                      <td className="p-3 text-sm text-muted-foreground">{test.notes || '-'}</td>
                    </tr>
                  ))}
                  {(!stats?.all_tests || stats.all_tests.length === 0) && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-muted-foreground">
                        Nessun test disponibile
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
