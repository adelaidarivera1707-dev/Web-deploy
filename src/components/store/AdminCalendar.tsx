import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink, MapPin, Phone, Calendar as IconCalendar, Clock, DollarSign, FileText } from 'lucide-react';
import { parseDurationToMinutes } from '../../utils/calendar';

interface ContractItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventType?: string;
  eventDate?: string; // YYYY-MM-DD
  eventTime?: string; // HH:mm
  eventLocation?: string;
  packageDuration?: string;
  paymentMethod?: string;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  status?: 'pending' | 'booked' | 'delivered' | 'cancelled' | 'pending_payment' | 'confirmed';
  pdfUrl?: string | null;
  phone?: string;
  formSnapshot?: any;
}

type StatusFilter = 'all' | 'pending' | 'booked' | 'delivered' | 'cancelled' | 'pending_payment';

const startOfMonth = (y: number, m: number) => new Date(y, m, 1);
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);
const toLocalDate = (s?: string) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

function getEventColor(c: ContractItem): string {
  if (c.status === 'cancelled') return 'bg-red-500 text-white hover:opacity-90';
  if (c.status === 'delivered' || (c.eventCompleted && c.finalPaymentPaid)) return 'bg-green-600 text-white hover:opacity-90';
  if (c.status === 'pending_payment' || c.depositPaid === false) return 'bg-gray-400 text-white hover:opacity-90';
  if (c.status === 'confirmed' || (c.depositPaid && !c.eventCompleted && c.status !== 'cancelled')) return 'bg-blue-600 text-white hover:opacity-90';
  return 'bg-yellow-500 text-black hover:opacity-90';
}

const AdminCalendar: React.FC = () => {
  const today = new Date();
  const [current, setCurrent] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [events, setEvents] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState<number>(today.getMonth());
  const [filterYear, setFilterYear] = useState<number>(today.getFullYear());
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<ContractItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<any>({ clientName: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', paymentMethod: 'pix' });
  const [dressOptions, setDressOptions] = useState<{ id: string; name: string; image: string; color?: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const col = collection(db, 'contracts');
      let q: any = col;
      try { q = query(col, orderBy('createdAt', 'desc')); } catch (_) { q = col; }
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ContractItem[];
      setEvents(list);
    } catch (e) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const loadDresses = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((p: any) => {
            const c = String((p as any).category || '').toLowerCase();
            return c.includes('vestid') || c.includes('dress');
          })
          .map((p: any) => ({ id: p.id, name: p.name || 'Vestido', image: p.image_url || p.image || '', color: Array.isArray(p.tags) && p.tags.length ? String(p.tags[0]) : '' }));
        setDressOptions(list);
      } catch (e) {
        setDressOptions([]);
      }
    };
    if (selected) loadDresses();
  }, [selected]);

  const monthDays = useMemo(() => {
    const first = startOfMonth(current.y, current.m);
    const last = endOfMonth(current.y, current.m);
    const startWeekday = (first.getDay() + 6) % 7; // Monday-first
    const total = last.getDate();
    const cells: Array<{ date: Date | null } > = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= total; d++) cells.push({ date: new Date(current.y, current.m, d) });
    return cells;
  }, [current]);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const d = toLocalDate(ev.eventDate);
      if (!d) return false;
      const monthMatch = d.getMonth() === filterMonth;
      const yearMatch = d.getFullYear() === filterYear;
      const status = (() => {
        if (ev.status) return ev.status;
        if (ev.eventCompleted && ev.finalPaymentPaid) return 'delivered' as const;
        if (ev.depositPaid === false) return 'pending_payment' as const;
        return 'booked' as const;
      })();
      const statusMatch = filterStatus === 'all' ? true : status === filterStatus;
      return monthMatch && yearMatch && statusMatch;
    });
  }, [events, filterMonth, filterYear, filterStatus]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ContractItem[]>();
    filteredEvents.forEach(ev => {
      if (!ev.eventDate) return;
      const key = ev.eventDate;
      map.set(key, [...(map.get(key) || []), ev]);
    });
    return map;
  }, [filteredEvents]);

  const goToday = () => { const t = new Date(); setCurrent({ y: t.getFullYear(), m: t.getMonth() }); setFilterMonth(t.getMonth()); setFilterYear(t.getFullYear()); };
  const prevMonth = () => setCurrent(c => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }));
  const nextMonth = () => setCurrent(c => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }));

  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('es', { month: 'long' }));
  const years = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 3 + i);

  const handleSaveStatus = async (id: string, status: ContractItem['status']) => {
    await updateDoc(doc(db, 'contracts', id), { status } as any);
    await load();
  };

  const handleAddEvent = async () => {
    if (!addForm.clientName || !addForm.eventDate) return;
    const payload: any = {
      clientName: addForm.clientName,
      clientEmail: addForm.clientEmail || '',
      eventType: addForm.eventType || 'Evento',
      eventDate: addForm.eventDate,
      eventTime: addForm.eventTime || '00:00',
      eventLocation: addForm.eventLocation || '',
      paymentMethod: addForm.paymentMethod || 'pix',
      depositPaid: false,
      finalPaymentPaid: false,
      eventCompleted: false,
      createdAt: new Date().toISOString(),
      totalAmount: Number(addForm.totalAmount || 0) || 0,
      travelFee: Number(addForm.travelFee || 0) || 0,
      status: 'booked' as const,
    };
    await addDoc(collection(db, 'contracts'), payload);
    setAdding(false);
    setAddForm({ clientName: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', paymentMethod: 'pix' });
    await load();
  };

  const openContractPreview = (c: ContractItem) => {
    if (c.pdfUrl) {
      window.open(c.pdfUrl, '_blank');
      return;
    }
    try {
      sessionStorage.setItem('admin_contract_preview', JSON.stringify(c));
    } catch {}
    window.open('/admin/contract-preview', '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Filters / Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex flex-wrap gap-1 items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="px-2 py-1 border rounded-none"><ChevronLeft size={16}/></button>
          <div className="text-base font-semibold w-32 text-center">
            {new Date(current.y, current.m, 1).toLocaleString('es', { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={nextMonth} className="px-2 py-1 border rounded-none"><ChevronRight size={16}/></button>
          <button onClick={goToday} className="ml-2 px-2 py-1 border-2 border-black text-black rounded-none hover:bg-black hover:text-white inline-flex items-center gap-1 text-sm">Hoy</button>
        </div>
        <div className="flex items-center gap-1">
          <select value={filterMonth} onChange={e=> setFilterMonth(Number(e.target.value))} className="px-2 py-1 border rounded-none text-sm">
            {months.map((m,i)=> <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e=> setFilterYear(Number(e.target.value))} className="px-2 py-1 border rounded-none text-sm">
            {years.map(y=> <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterStatus} onChange={e=> setFilterStatus(e.target.value as StatusFilter)} className="px-2 py-1 border rounded-none text-sm">
            <option value="all">Todos</option>
            <option value="pending_payment">Pendiente de pago</option>
            <option value="booked">Contratado</option>
            <option value="delivered">Entregado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <button onClick={()=> setAdding(true)} className="ml-2 px-2 py-1 border-2 border-black text-black rounded-none hover:bg-black hover:text-white inline-flex items-center gap-1 text-sm"><Plus size={14}/> Añadir evento</button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 text-center text-xs text-gray-500 py-2 border-b">
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((d)=> <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {monthDays.map((cell, idx)=>{
            const isToday = cell.date && new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()).getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const key = cell.date ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.date.getDate()).padStart(2,'0')}` : `empty-${idx}`;
            const dayEvents = cell.date ? (eventsByDay.get(key) || []) : [];
            return (
              <div key={key} className="bg-white min-h-28 p-2 relative">
                <div className="text-xs">{cell.date ? (isToday ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-black">{cell.date.getDate()}</span> : <span className="text-gray-500">{cell.date.getDate()}</span>) : ''}</div>
                <div className="mt-1 space-y-1">
                  {dayEvents.map(ev => {
                    const durationMin = parseDurationToMinutes(ev.packageDuration || '2 horas');
                    const end = (() => {
                      const d = ev.eventDate || key; const t = ev.eventTime || '00:00';
                      const start = new Date(`${d}T${t}:00`);
                      return new Date(start.getTime() + durationMin * 60000);
                    })();
                    const label = `${(ev.eventTime || '00:00')} ${ev.clientName || 'Evento'}`;
                    return (
                      <button key={ev.id} onClick={()=> setSelected(ev)} className={`w-full text-left px-2 py-1 rounded-md ${getEventColor(ev)} text-xs flex items-center gap-1`}>
                        <IconCalendar size={12}/><span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=> setSelected(null)}>
          <div className="bg-white rounded-xl w-full max-w-xl p-4" onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-medium">{selected.clientName}</div>
              <button onClick={()=> setSelected(null)} className="text-gray-500 hover:text-gray-900"><X/></button>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <div className="flex items-center gap-2"><FileText size={16}/> <span>Tipo:</span> <strong>{selected.eventType || '-'}</strong></div>
              <div className="flex items-center gap-2"><IconCalendar size={16}/> <span>Fecha:</span> <strong>{selected.eventDate}</strong> <Clock size={16}/> <span>Hora:</span> <strong>{selected.eventTime || '-'}</strong></div>
              <div className="flex items-center gap-2"><MapPin size={16}/> <span>Ubicación:</span> <strong>{selected.eventLocation || '-'}</strong></div>
              <div className="flex items-center gap-2"><Phone size={16}/> <span>Tel.:</span> <strong>{selected.formSnapshot?.phone || '-'}</strong></div>
              <div className="flex items-center gap-2"><DollarSign size={16}/> <span>Pago:</span> <strong>{selected.paymentMethod || '-'}</strong> • <span>Depósito:</span> <strong>{selected.depositPaid ? 'Pago' : 'Pendiente'}</strong> • <span>Saldo:</span> <strong>{selected.finalPaymentPaid ? 'Pago' : 'Pendiente'}</strong></div>

              {Array.isArray(selected.formSnapshot?.selectedDresses) && selected.formSnapshot!.selectedDresses.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Vestidos seleccionados</div>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.formSnapshot!.selectedDresses
                      .map((id: string) => dressOptions.find(d => d.id === id))
                      .filter(Boolean)
                      .map(dress => (
                        <div key={(dress as any).id} className="flex items-center gap-2">
                          <div className="w-10 h-16 rounded overflow-hidden bg-gray-100 relative">
                            {(dress as any).image && <img src={(dress as any).image} alt={(dress as any).name} className="absolute inset-0 w-full h-full object-cover" />}
                          </div>
                          <div className="text-xs">
                            <div className="font-medium text-gray-800">{(dress as any).name}</div>
                            {(dress as any).color && <div className="text-[10px] text-gray-500">{(dress as any).color}</div>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2"><span>Estado:</span>
                <select value={selected.status || (selected.eventCompleted && selected.finalPaymentPaid ? 'delivered' : (selected.depositPaid === false ? 'pending_payment' : 'booked'))} onChange={async e=>{ const st = e.target.value as ContractItem['status']; await handleSaveStatus(selected.id, st); setSelected(s=> s ? ({ ...s, status: st }) : s); }} className="px-2 py-1 border rounded-none text-sm">
                  <option value="booked">Contratado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="pending_payment">Pendiente de pago</option>
                  <option value="delivered">Entregado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={()=> openContractPreview(selected)} className="px-4 py-2 rounded-md bg-blue-600 text-white inline-flex items-center gap-2 hover:bg-blue-700"><ExternalLink size={16}/> Ver Contrato</button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=> setAdding(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl p-4" onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-medium">Añadir evento</div>
              <button onClick={()=> setAdding(false)} className="text-gray-500 hover:text-gray-900"><X/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Cliente</label>
                <input value={addForm.clientName} onChange={e=> setAddForm((f:any)=> ({ ...f, clientName: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Tipo de evento</label>
                <input value={addForm.eventType} onChange={e=> setAddForm((f:any)=> ({ ...f, eventType: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Fecha</label>
                <input type="date" value={addForm.eventDate} onChange={e=> setAddForm((f:any)=> ({ ...f, eventDate: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Hora</label>
                <input type="time" value={addForm.eventTime} onChange={e=> setAddForm((f:any)=> ({ ...f, eventTime: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600">Ubicación</label>
                <input value={addForm.eventLocation} onChange={e=> setAddForm((f:any)=> ({ ...f, eventLocation: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Método de pago</label>
                <select value={addForm.paymentMethod} onChange={e=> setAddForm((f:any)=> ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border rounded-none">
                  <option value="pix">PIX</option>
                  <option value="credit">Crédito</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Desplazamiento (R$)</label>
                <input type="number" value={addForm.travelFee || 0} onChange={e=> setAddForm((f:any)=> ({ ...f, travelFee: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Total (R$)</label>
                <input type="number" value={addForm.totalAmount || 0} onChange={e=> setAddForm((f:any)=> ({ ...f, totalAmount: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=> setAdding(false)} className="px-3 py-2 border rounded-none">Cancelar</button>
              <button onClick={handleAddEvent} className="px-3 py-2 border-2 border-black bg-black text-white rounded-none">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Cargando…</div>}
    </div>
  );
};

export default AdminCalendar;
