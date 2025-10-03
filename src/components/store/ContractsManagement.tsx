import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { ChevronDown, ChevronUp, CheckCircle, Clock, FileText, Loader, Mail, MapPin, Phone, Settings, Trash2, User, DollarSign, Link as LinkIcon, Calendar, Pencil, Plus, X, Trash } from 'lucide-react';
import { defaultWorkflow, categoryColors, WorkflowTemplate } from './_contractsWorkflowHelper';
import { generatePDF } from '../../utils/pdf';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface WorkflowTask { id: string; title: string; done: boolean; due?: string | null; note?: string }
interface WorkflowCategory { id: string; name: string; tasks: WorkflowTask[] }

interface ContractItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventType?: string;
  eventDate?: string;
  eventTime?: string;
  contractDate?: string;
  totalAmount?: number;
  travelFee?: number;
  paymentMethod?: string;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  services?: any[];
  storeItems?: any[];
  message?: string;
  createdAt?: string;
  pdfUrl?: string;
  workflow?: WorkflowCategory[];
  reminders?: { type: 'finalPayment'; sendAt: string }[];
  formSnapshot?: any;
  packageTitle?: string;
  packageDuration?: string;
  eventLocation?: string;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const ContractsManagement = () => {
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContractItem | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [viewing, setViewing] = useState<ContractItem | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowCategory[] | null>(null);
  const [savingWf, setSavingWf] = useState(false);
  const [wfEditMode, setWfEditMode] = useState(false);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [tplEditing, setTplEditing] = useState<WorkflowTemplate | null>(null);
  const [defaults, setDefaults] = useState<{ packages?: string; products?: string }>({});
  const [packagesList, setPackagesList] = useState<{ id: string; title: string; duration?: string; price?: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<any>({ clientName: '', clientEmail: '', clientPhone: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', packageTitle: '', packageDuration: '', paymentMethod: 'pix', totalAmount: 0, travelFee: 0, message: '' });
  const [dressOptions, setDressOptions] = useState<{ id: string; name: string; image: string; color?: string }[]>([]);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setContracts([]);
        return;
      }
      let items: ContractItem[] = [];
      try {
        const snap = await getDocs(query(collection(db, 'contracts'), orderBy('createdAt', 'desc')));
        items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (_) {
        try {
          const snap = await getDocs(collection(db, 'contracts'));
          items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        } catch (e) {
          console.warn('No se pudieron cargar los contratos', e);
          items = [];
        }
      }
      setContracts(items);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const snap = await getDocs(collection(db, 'workflowTemplates'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as WorkflowTemplate[];
      setTemplates(list);
    } catch (e) {
      console.warn('No se pudieron cargar templates de workflow', e);
      setTemplates([]);
    }
    try {
      const defDoc = await getDoc(doc(db, 'settings', 'workflowDefaults'));
      setDefaults((defDoc.exists() ? defDoc.data() : {}) as any);
    } catch (e) {
      console.warn('No se pudieron cargar defaults de workflow', e);
      setDefaults({});
    }
  };

  useEffect(() => { fetchContracts(); }, []);

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
    if (viewing) loadDresses();
  }, [viewing]);

  useEffect(() => {
    const fetchPkgs = async () => {
      try {
        const snap = await getDocs(collection(db, 'packages'));
        const list = snap.docs.map(d => ({ id: d.id, title: (d.data() as any).title || 'Paquete', duration: (d.data() as any).duration || '', price: Number((d.data() as any).price || 0) }));
        setPackagesList(list);
      } catch {
        setPackagesList([]);
      }
    };
    if (editing || creating) fetchPkgs();
  }, [editing, creating]);

  const filtered = useMemo(() => {
    const list = (() => {
      if (!search.trim()) return contracts;
      const s = search.toLowerCase();
      return contracts.filter(c => {
        const nameMatch = (c.clientName || '').toLowerCase().includes(s);
        const typeMatch = (c.eventType || '').toLowerCase().includes(s);
        const phoneSource = (c as any).clientPhone || (c as any).phone || (c as any).client_phone || (c as any).formSnapshot?.phone || '';
        const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
        const phoneMatch = onlyDigits(phoneSource).includes(s.replace(/\D/g, ''));
        return nameMatch || typeMatch || phoneMatch;
      });
    })();

    const now = new Date().getTime();
    const mapped = list.map(c => {
      const ev = c.eventDate ? new Date(c.eventDate) : undefined;
      const t = ev && !isNaN(ev.getTime()) ? ev.getTime() : new Date(c.contractDate || c.createdAt || Date.now()).getTime();
      const diff = Math.abs(t - now);
      return { c, diff };
    });

    mapped.sort((a, b) => {
      const ap = a.c.eventCompleted ? 1 : 0;
      const bp = b.c.eventCompleted ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return a.diff - b.diff;
    });

    return mapped.map(m => m.c);
  }, [contracts, search]);

  const computeAmounts = (c: ContractItem) => {
    const servicesList = Array.isArray(c.services) ? c.services : [];
    let servicesTotal = servicesList.reduce((sum, it: any) => {
      const qty = Number(it.quantity ?? 1);
      const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
      return sum + (price * qty);
    }, 0);
    if (servicesTotal === 0 && (c as any).packageTitle) {
      const pkg = packagesList.find(p => p.title === (c as any).packageTitle);
      if (pkg && pkg.price && !isNaN(pkg.price)) servicesTotal = Number(pkg.price);
    }
    const storeTotal = (Array.isArray(c.storeItems) ? c.storeItems : []).reduce((sum, it: any) => sum + (Number(it.price) * Number(it.quantity || 1)), 0);
    const travel = Number(c.travelFee || 0);
    const totalAmount = Math.round(servicesTotal + storeTotal + travel);

    let depositAmount = 0;
    if (servicesTotal <= 0 && storeTotal > 0) depositAmount = Math.ceil((storeTotal + travel) * 0.5);
    else depositAmount = Math.ceil(servicesTotal * 0.2 + storeTotal * 0.5);
    const remainingAmount = Math.max(0, Math.round(totalAmount - depositAmount));
    return { servicesTotal, storeTotal, travel, totalAmount, depositAmount, remainingAmount };
  };

  const toggleFlag = async (id: string, field: keyof ContractItem) => {
    const current = contracts.find(c => c.id === id);
    if (!current) return;
    const next = !Boolean(current[field]);
    await updateDoc(doc(db, 'contracts', id), { [field]: next } as any);
    await fetchContracts();
  };

  const openEdit = (c: ContractItem) => {
    setEditing(c);
    setEditForm({
      clientName: c.clientName || '',
      clientEmail: c.clientEmail || '',
      eventType: c.eventType || '',
      eventDate: c.eventDate || '',
      eventTime: (c as any).eventTime || '',
      eventLocation: (c as any).eventLocation || '',
      packageTitle: (c as any).packageTitle || '',
      packageDuration: (c as any).packageDuration || '',
      paymentMethod: c.paymentMethod || '',
      totalAmount: Number(c.totalAmount || 0),
      travelFee: Number(c.travelFee || 0),
      message: c.message || ''
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const id = editing.id;

    // Merge editing with form changes to compute correctly
    const merged: ContractItem = {
      ...editing,
      clientName: String(editForm.clientName || editing.clientName || ''),
      clientEmail: String(editForm.clientEmail || editing.clientEmail || ''),
      eventType: String(editForm.eventType || editing.eventType || ''),
      eventDate: String(editForm.eventDate || editing.eventDate || ''),
      paymentMethod: String(editForm.paymentMethod || editing.paymentMethod || ''),
      message: String(editForm.message || editing.message || ''),
      totalAmount: Number(editForm.totalAmount ?? editing.totalAmount ?? 0),
      travelFee: Number(editForm.travelFee ?? editing.travelFee ?? 0),
      ...(editForm.eventTime !== undefined ? { eventTime: String(editForm.eventTime || '') } : {}),
      ...(editForm.eventLocation !== undefined ? { eventLocation: String(editForm.eventLocation || '') } : {}),
      ...(editForm.packageTitle !== undefined ? { packageTitle: String(editForm.packageTitle || '') } : {}),
      ...(editForm.packageDuration !== undefined ? { packageDuration: String(editForm.packageDuration || '') } : {}),
    } as any;

    const calc = computeAmounts(merged);

    const payload: Partial<ContractItem> = {
      clientName: merged.clientName,
      clientEmail: merged.clientEmail,
      eventType: merged.eventType,
      eventDate: merged.eventDate,
      eventCompleted: editing.eventCompleted,
      totalAmount: calc.totalAmount,
      travelFee: merged.travelFee,
      paymentMethod: merged.paymentMethod,
      message: merged.message,
      ...(merged.eventTime !== undefined ? { eventTime: merged.eventTime } : {}),
      ...(merged.eventLocation !== undefined ? { eventLocation: merged.eventLocation } : {}),
      ...(merged.packageTitle !== undefined ? { packageTitle: merged.packageTitle } : {}),
      ...(merged.packageDuration !== undefined ? { packageDuration: merged.packageDuration } : {}),
      ...( { depositAmount: calc.depositAmount, remainingAmount: calc.remainingAmount } as any )
    } as any;

    await updateDoc(doc(db, 'contracts', id), payload as any);
    setViewing(v => v && v.id === id ? ({ ...v, ...payload }) as any : v);
    setEditing(null);
    await fetchContracts();
  };

  const openView = async (c: ContractItem) => {
    setWfEditMode(false);
    setViewing(c);
    const base = (c.workflow && c.workflow.length) ? c.workflow : [];

    const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    const merged = JSON.parse(JSON.stringify(base)) as WorkflowCategory[];
    const findIdx = merged.findIndex(cat => normalize(cat.name).includes('entrega'));
    const idx = findIdx >= 0 ? findIdx : merged.length;
    if (findIdx < 0) merged.push({ id: uid(), name: 'Entrega de productos', tasks: [] });
    const cat = merged[idx];
    (Array.isArray(c.storeItems) ? c.storeItems : []).forEach((it: any) => {
      const title = `Entregar ${String(it.name || '')}`;
      if (!cat.tasks.some(t => normalize(t.title) === normalize(title))) {
        cat.tasks.push({ id: uid(), title, done: false });
      }
    });
    merged[idx] = cat;

    setWorkflow(JSON.parse(JSON.stringify(merged)));
    if (templates.length === 0) await fetchTemplates();
  };

  const saveWorkflow = async () => {
    if (!viewing || !workflow) return;
    setSavingWf(true);
    try {
      await updateDoc(doc(db, 'contracts', viewing.id), { workflow } as any);
      await fetchContracts();
    } finally {
      setSavingWf(false);
    }
  };

  const applyTemplateToContract = async (tpl: WorkflowTemplate | null) => {
    if (!tpl || !viewing) return;
    const cloned = tpl.categories.map(c => ({ id: c.id || uid(), name: c.name, tasks: c.tasks.map(t => ({ ...t, id: t.id || uid(), done: false })) }));
    setWorkflow(cloned);
  };

  const loadDefaults = async () => {
    const d = await getDoc(doc(db, 'settings', 'workflowDefaults'));
    setDefaults((d.exists() ? d.data() : {}) as any);
  };

  const scheduleFinalPaymentEmail = async () => {
    if (!viewing) return;
    const dateStr = viewing.eventDate || '';
    const timeStr = viewing.eventTime || (viewing as any).eventTime || '00:00';
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(dt.getTime())) return;
    const sendAt = new Date(dt.getTime() - 30 * 60000).toISOString();
    const nextRem = [ ...(viewing.reminders || []).filter(r => r.type !== 'finalPayment'), { type: 'finalPayment' as const, sendAt } ];
    await updateDoc(doc(db, 'contracts', viewing.id), { reminders: nextRem } as any);
    await fetchContracts();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este contrato?')) return;
    await deleteDoc(doc(db, 'contracts', id));
    await fetchContracts();
  };

  const isPast = (c: ContractItem) => {
    if (!c.eventDate) return false;
    const d = new Date(c.eventDate);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };

  const colorsFor = (len: number) => categoryColors(len);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gestión de Contratos</h2>
        <div className="flex items-center gap-2">
          <button onClick={()=> setCreating(true)} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90 inline-flex items-center gap-2"><Plus size={14}/> Nuevo contrato</button>
          <button onClick={async ()=>{ await fetchTemplates(); setTemplatesOpen(true); }} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Workflows</button>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente/teléfono" className="px-3 py-2 border rounded-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 p-3 text-xs font-medium border-b">
          <div className="col-span-2">Fecha principal</div>
          <div className="col-span-3">Nombre del trabajo</div>
          <div className="col-span-2">Teléfono</div>
          <div className="col-span-1">Tipo</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-2">Progreso del flujo</div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>
        {loading && <div className="p-4 text-sm text-gray-500">Cargando...</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-sm text-gray-500">Sin resultados</div>}
        <div className="divide-y">
          {filtered.map(c => {
            const wf = (c.workflow && c.workflow.length) ? c.workflow : defaultWorkflow(c);
            const segments = wf.map(cat => {
              const total = cat.tasks.length || 1;
              const done = cat.tasks.filter(t => t.done).length;
              return total === 0 ? 0 : Math.round((done/total)*100);
            });
            const deliveryCat = wf.find(cat => cat.name && cat.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').includes('entrega'));
            const dTotal = deliveryCat ? (deliveryCat.tasks.length || 0) : 0;
            const dDone = deliveryCat ? deliveryCat.tasks.filter(t => t.done).length : 0;
            const deliveryPct = dTotal > 0 ? Math.round((dDone / dTotal) * 100) : 0;
            return (
              <div key={c.id} className="grid grid-cols-12 p-3 items-center hover:bg-gray-50 cursor-pointer" onClick={() => openView(c)}>
                <div className="col-span-2 text-sm">{c.eventDate || '-'}</div>
                <div className="col-span-3 lowercase first-letter:uppercase">{c.clientName || 'Trabajo'}</div>
                <div className="col-span-2 text-sm">{((c as any).clientPhone || (c as any).phone || (c as any).client_phone || (c as any).formSnapshot?.phone || '') || '-'}</div>
                <div className="col-span-1 text-sm">{c.eventType || '-'}</div>
                <div className="col-span-1 font-semibold">R$ {Number(c.totalAmount || 0).toFixed(0)}</div>
                <div className="col-span-2">
                  <div className="w-full h-3 rounded bg-gray-200 overflow-hidden flex">
                    {segments.map((p, i) => (
                      <div key={i} className="relative flex-1 bg-gray-200">
                        <div className="absolute inset-y-0 left-0" style={{ width: `${p}%`, backgroundColor: (deliveryPct >= 67 ? '#16a34a' : deliveryPct >= 34 ? '#eab308' : '#ef4444') }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <button onClick={(e)=>{e.stopPropagation(); remove(c.id);}} title="Eliminar" className="border-2 border-red-600 text-red-600 px-2 py-1 rounded-none hover:bg-red-600 hover:text-white inline-flex items-center"><Trash2 size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    {viewing && workflow && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setViewing(null)}>
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-5xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <div className="text-lg font-medium">{viewing.clientName} — {viewing.eventType || 'Trabajo'}</div>
              <div className="text-xs text-gray-500">Fecha principal: {viewing.eventDate || '-' } • Hora: {viewing.eventTime || (viewing as any).eventTime || '-'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=> viewing && openEdit(viewing)} className="border px-3 py-2 rounded-none text-sm">Modificar datos</button>
              <button onClick={async()=>{
                if (!viewing) return;
                navigate('/admin/contract-preview', { state: { contract: viewing } });
              }} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none text-sm hover:opacity-90">Descargar</button>
              <button onClick={()=>setViewing(null)} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
          </div>
          {/* Offscreen PDF content */}
          {viewing && (
            <div style={{ position:'fixed', left:-99999, top:0, width:'800px', background:'#fff' }}>
              <div ref={pdfRef} className="bg-white relative">
                {/* Watermark overlay COPIA */}
                <div style={{ position:'absolute', inset:0, backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><text x=\'100\' y=\'110\' text-anchor=\'middle\' fill=\'rgba(255,0,0,0.10)\' font-size=\'48\' transform=\'rotate(-30, 100, 100)\' font-family=\'sans-serif\'>COPIA</text></svg>")', backgroundRepeat:'repeat', backgroundSize:'200px 200px', pointerEvents:'none', zIndex:0 } as any} />
                <div className="bg-primary text-white p-8 text-center relative" style={{ zIndex: 1 }}>
                  <h1 className="text-2xl font-semibold mb-1">Contrato de Prestación de Servicios Fotográficos</h1>
                  <p className="text-white/80">Wild Pictures Studio</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-600">Nombre:</span> <span className="font-medium">{viewing.clientName || '-'}</span></div>
                    <div><span className="text-gray-600">Email:</span> <span className="font-medium">{viewing.clientEmail || '-'}</span></div>
                    <div><span className="text-gray-600">Tipo de evento:</span> <span className="font-medium">{viewing.eventType || '-'}</span></div>
                    <div><span className="text-gray-600">Fecha evento:</span> <span className="font-medium">{viewing.eventDate || '-'}</span></div>
                    <div><span className="text-gray-600">Hora:</span> <span className="font-medium">{(viewing as any).eventTime || '-'}</span></div>
                    <div><span className="text-gray-600">Ubicación:</span> <span className="font-medium">{(viewing as any).eventLocation || '-'}</span></div>
                    <div><span className="text-gray-600">Paquete:</span> <span className="font-medium">{(viewing as any).packageTitle || '-'}</span></div>
                    <div><span className="text-gray-600">Duración:</span> <span className="font-medium">{(viewing as any).packageDuration || '-'}</span></div>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Items del contrato</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="py-1">Item</th>
                          <th className="py-1">Cant.</th>
                          <th className="py-1">Precio</th>
                          <th className="py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewing.services || []).map((it: any, idx: number) => {
                          const qty = Number(it.quantity ?? 1);
                          const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
                          const total = price * qty;
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-1">{it.name || it.id || '—'}</td>
                              <td className="py-1">{qty}</td>
                              <td className="py-1">R$ {price.toFixed(0)}</td>
                              <td className="py-1">R$ {total.toFixed(0)}</td>
                            </tr>
                          );
                        })}
                        {Array.isArray(viewing.storeItems) && viewing.storeItems.map((it: any, idx: number) => (
                          <tr key={`store-${idx}`} className="border-t">
                            <td className="py-1">{it.name}</td>
                            <td className="py-1">{Number(it.quantity)}</td>
                            <td className="py-1">R$ {Number(it.price).toFixed(0)}</td>
                            <td className="py-1">R$ {(Number(it.price) * Number(it.quantity)).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-primary text-white px-6 py-3 border-b">
                      <h2 className="text-lg font-medium">Cláusulas Contratuais</h2>
                    </div>
                    <div className="p-6 space-y-6 text-sm text-gray-700">
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 1ª – DAS OBRIGAÇÕES DA CONTRATADA</h3>
                        <div className="space-y-2">
                          <p>1.1. Comparecer ao evento com antecedência suficiente, garantindo o fiel cumprimento do tempo de cobertura contratado.</p>
                          <p>1.2. Entregar todas as fotografias editadas, com correção de cores, no prazo máximo de 15 (quinze) dias úteis após a realização do evento.</p>
                          <p>1.3. Disponibilizar todos os arquivos digitais em alta resolução, devidamente editados e sem marca d'água.</p>
                          <p>1.4. Manter sigilo sobre as informações pessoais e familiares dos contratantes.</p>
                        </div>
                      </section>
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 2ª – DAS OBRIGAÇÕES DA CONTRATANTE</h3>
                        <div className="space-y-2">
                          <p>2.1. Realizar o pagamento conforme estipulado: 20% do valor total como sinal de reserva e o restante no dia do evento.</p>
                          <p>2.2. Fornecer todas as informações necessárias sobre o evento (horários, locais, pessoas importantes).</p>
                          <p>2.3. Garantir acesso aos locais do evento e cooperação das pessoas envolvidas.</p>
                          <p>2.4. Comunicar qualquer alteração com antecedência mínima de 48 horas.</p>
                        </div>
                      </section>
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 3ª – DA ENTREGA E DIREITOS AUTORAIS</h3>
                        <div className="space-y-2">
                          <p>3.1. As fotografias serão entregues em formato digital através de galeria online privada.</p>
                          <p>3.2. Os direitos autorais das fotografias pertencem ao fotógrafo, sendo concedido ao contratante o direito de uso pessoal.</p>
                          <p>3.3. É vedada a reprodução comercial das imagens sem autorização expressa da contratada.</p>
                          <p>3.4. A contratada poderá utilizar as imagens para fins de divulgação de seu trabalho.</p>
                        </div>
                      </section>
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 4ª – DO CANCELAMENTO E REAGENDAMENTO</h3>
                        <div className="space-y-2">
                          <p>4.1. Em caso de cancelamento pela contratante com mais de 30 dias de antecedência, será devolvido 50% do valor pago.</p>
                          <p>4.2. Cancelamentos com menos de 30 dias não terão devolução do valor pago.</p>
                          <p>4.3. Reagendamentos estão sujeitos à disponibilidade da agenda da contratada.</p>
                          <p>4.4. Casos de força maior serão analisados individualmente.</p>
                        </div>
                      </section>
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 5ª – DAS DISPOSIÇÕES GERAIS</h3>
                        <div className="space-y-2">
                          <p>5.1. Este contrato é regido pelas leis brasileiras.</p>
                          <p>5.2. Eventuais conflitos serão resolvidos preferencialmente por mediação.</p>
                          <p>5.3. As partes elegem o foro da comarca de Curitiba/PR para dirimir questões oriundas deste contrato.</p>
                          <p>5.4. Este contrato entra em vigor na data de sua assinatura.</p>
                        </div>
                      </section>
                      <section>
                        <h3 className="text-base font-medium text-primary mb-2">CLÁUSULA 6ª – DA CLÁUSULA PENAL</h3>
                        <div className="space-y-2">
                          <p>6.1. O descumprimento, por qualquer das partes, das obrigações assumidas neste contrato, sujeitará a parte infratora ao pagamento de multa equivalente a 1/3 (um terço) do valor total do contrato, sem prejuízo de eventuais perdas e danos.</p>
                          <p>6.2. A cláusula penal não afasta a possibilidade de cobrança judicial ou extrajudicial de danos adicionais comprovadamente sofridos pela parte prejudicada.</p>
                          <p>6.3. No caso de a CONTRATADA não comparecer no dia do evento ou não entregar o material contratado nos prazos estabelecidos, a multa será aplicada de forma imediata, facultando ao(à) CONTRATANTE a execução do contrato e o ajuizamento de ação para reparação integral dos prejuízos, incluindo eventual indenização por danos morais.</p>
                          <p>6.4. Em caso fortuito ou força maior, devidamente comprovados, não se aplicam as penalidades acima descritas, sendo o contrato desfeito sem prejuízo a ambas as partes.</p>
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="bg-primary text-white px-6 py-3 border-b">
                      <h2 className="text-lg font-medium">Assinaturas das Partes</h2>
                    </div>
                    <div className="p-6 grid md:grid-cols-2 gap-12">
                      <div className="text-center">
                        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                          <h4 className="font-medium text-primary mb-4">CONTRATADA</h4>
                          <div className="mb-4 h-20 flex items-center justify-center">
                            <img src="/firma_fotografo.png" alt="Assinatura do Fotógrafo" className="max-h-16" />
                          </div>
                          <div className="border-t border-gray-300 pt-4">
                            <p className="font-medium text-gray-900">Wild Pictures Studio</p>
                            <p className="text-sm text-gray-600">CNPJ: 52.074.297/0001-33</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 relative overflow-hidden">
                          <h4 className="font-medium text-primary mb-4">CONTRATANTE</h4>
                          <div className="mb-4 h-20 flex items-center justify-center border border-dashed border-gray-300 bg-white relative">
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-red-500/60 select-none" style={{ transform: 'rotate(-20deg)' }}>COPIA</span>
                          </div>
                          <div className="border-t border-gray-300 pt-4">
                            <p className="font-medium text-gray-900">{viewing.clientName}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="md:col-span-1 border-r p-4 max-h-[70vh] overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Workflow</h3>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setWfEditMode(v=>!v)} className="text-xs border px-2 py-1 rounded-none">{wfEditMode? 'Salir de edición':'Editar'}</button>
                </div>
              </div>
              <div className="space-y-4">
                {workflow.map((cat, ci) => {
                  const cols = colorsFor(workflow.length);
                  return (
                  <div key={cat.id} className="relative pl-3">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded" style={{ backgroundColor: cols[ci] }} />
                    <div className="flex items-center gap-2 mb-2">
                      {wfEditMode ? (
                        <input value={cat.name} onChange={e=>{
                          const val = e.target.value; setWorkflow(w=>{ const n = w? [...w]:[]; n[ci] = { ...n[ci], name: val }; return n;});
                        }} className="text-sm font-semibold border px-2 py-1 rounded-none" />
                      ) : (
                        <div className="text-sm font-semibold">{cat.name}</div>
                      )}
                      {wfEditMode && (
                        <button onClick={()=>{
                          setWorkflow(w=>{
                            const n = w? [...w]:[]; n.splice(ci,1); return n;
                          });
                        }} className="text-red-600 hover:text-red-800" title="Eliminar categoría"><Trash size={14}/></button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {cat.tasks.map((t, ti) => (
                        <div key={t.id} className="flex items-start gap-2">
                          {!wfEditMode && (
                            <input type="checkbox" checked={t.done} onChange={(e)=>{
                              setWorkflow(wf=>{
                                const next = wf ? [...wf] : [];
                                next[ci] = { ...next[ci], tasks: next[ci].tasks.map((x, idx)=> idx===ti? { ...x, done: e.target.checked }: x)};
                                return next;
                              });
                            }} />
                          )}
                          <div className="flex-1">
                            {wfEditMode ? (
                              <input value={t.title} onChange={e=>{
                                const val = e.target.value; setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks]; ts[ti] = { ...ts[ti], title: val }; n[ci] = { ...n[ci], tasks: ts }; return n;});
                              }} className="text-sm border px-2 py-1 rounded-none w-full" />
                            ) : (
                              <div className="text-sm">{t.title}</div>
                            )}
                            {t.due && !wfEditMode && <div className="text-xs text-gray-500">Vence: {new Date(t.due).toLocaleString('es-ES')}</div>}
                            {wfEditMode && (
                              <div className="mt-1 flex items-center gap-2 text-xs">
                                <label className="text-gray-600">Vence:</label>
                                <input type="datetime-local" value={t.due ? new Date(t.due).toISOString().slice(0,16): ''} onChange={e=>{
                                  const iso = e.target.value ? new Date(e.target.value).toISOString(): null;
                                  setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks]; ts[ti] = { ...ts[ti], due: iso }; n[ci] = { ...n[ci], tasks: ts }; return n;});
                                }} className="border px-2 py-1 rounded-none" />
                                <button onClick={()=>{
                                  setWorkflow(w=>{ const n = w? [...w]:[]; const ts = n[ci].tasks.filter((_,idx)=>idx!==ti); n[ci] = { ...n[ci], tasks: ts }; return n;});
                                }} className="text-red-600 hover:text-red-800" title="Eliminar tarea"><Trash size={14}/></button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {wfEditMode && (
                        <button onClick={()=>{
                          setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks, { id: uid(), title: 'Nueva tarea', done: false }]; n[ci] = { ...n[ci], tasks: ts }; return n;});
                        }} className="text-xs border px-2 py-1 rounded-none inline-flex items-center gap-1"><Plus size={12}/> Añadir tarea</button>
                      )}
                    </div>
                  </div>
                );})}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {wfEditMode && (
                  <button onClick={()=>{
                    setWorkflow(w=>{ const n = w? [...w]:[]; n.push({ id: uid(), name: 'Nueva categoría', tasks: [] }); return n;});
                  }} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white inline-flex items-center gap-2"><Plus size={14}/> Añadir categoría</button>
                )}
                <button onClick={saveWorkflow} disabled={savingWf} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90 disabled:opacity-50">Guardar</button>
                <div className="ml-auto flex items-center gap-2">
                  <select onChange={(e)=>{
                    const id = e.target.value; const tpl = templates.find(t=>t.id===id) || null; applyTemplateToContract(tpl);
                  }} className="border px-2 py-2 rounded-none text-sm">
                    <option value="">Elegir plantilla���</option>
                    {templates.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={()=> loadDefaults()} className="text-xs text-gray-600 underline">Cargar predeterminados</button>
                  {defaults.packages && <button onClick={()=>{ const tpl = templates.find(t=>t.id===defaults.packages) || null; applyTemplateToContract(tpl || null); }} className="border px-2 py-2 text-sm rounded-none">Aplicar def. Paquetes</button>}
                  {defaults.products && <button onClick={()=>{ const tpl = templates.find(t=>t.id===defaults.products) || null; applyTemplateToContract(tpl || null); }} className="border px-2 py-2 text-sm rounded-none">Aplicar def. Productos</button>}
                </div>
              </div>
            </div>
            <div className="md:col-span-2 p-4 max-h-[70vh] overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-600">Nombre:</span> <span className="font-medium">{viewing.clientName}</span></div>
                <div><span className="text-gray-600">Email:</span> <span className="font-medium">{viewing.clientEmail}</span></div>
                <div><span className="text-gray-600">Tipo de evento:</span> <span className="font-medium">{viewing.eventType || '-'}</span></div>
                <div><span className="text-gray-600">Fecha evento:</span> <span className="font-medium">{viewing.eventDate || '-'}</span></div>
                <div><span className="text-gray-600">Hora:</span> <span className="font-medium">{(viewing as any).eventTime || '-'}</span></div>
                <div><span className="text-gray-600">Fecha contrato:</span> <span className="font-medium">{viewing.contractDate || '-'}</span></div>
                <div><span className="text-gray-600">Ubicación:</span> <span className="font-medium">{(viewing as any).eventLocation || '-'}</span></div>
                <div><span className="text-gray-600">Paquete:</span> <span className="font-medium">{(viewing as any).packageTitle || '-'}</span></div>
                <div><span className="text-gray-600">Duraci��n:</span> <span className="font-medium">{(viewing as any).packageDuration || '-'}</span></div>
                <div><span className="text-gray-600">Método de pago:</span> <span className="font-medium">{viewing.paymentMethod || '-'}</span></div>
                {(() => {
                  const calc = computeAmounts(viewing);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Depósito:</span>
                        <span className="font-medium">R$ {calc.depositAmount.toFixed(0)}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${viewing.depositPaid? 'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{viewing.depositPaid? 'Pagado':'No pagado'}</span>
                        <button
                          onClick={async ()=>{ await toggleFlag(viewing.id, 'depositPaid'); setViewing(v=> v? { ...v, depositPaid: !v.depositPaid }: v); }}
                          className={`text-xs px-2 py-1 border rounded-none ${viewing.depositPaid? 'border-green-600 text-green-700 hover:bg-green-600 hover:text-white':'border-red-600 text-red-700 hover:bg-red-600 hover:text-white'}`}
                        >{viewing.depositPaid? 'Marcar No pagado':'Marcar Pagado'}</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Restante:</span>
                        <span className="font-medium">R$ {calc.remainingAmount.toFixed(0)}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${viewing.finalPaymentPaid? 'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{viewing.finalPaymentPaid? 'Pagado':'No pagado'}</span>
                        <button
                          onClick={async ()=>{ await toggleFlag(viewing.id, 'finalPaymentPaid'); setViewing(v=> v? { ...v, finalPaymentPaid: !v.finalPaymentPaid }: v); }}
                          className={`text-xs px-2 py-1 border rounded-none ${viewing.finalPaymentPaid? 'border-green-600 text-green-700 hover:bg-green-600 hover:text-white':'border-red-600 text-red-700 hover:bg-red-600 hover:text-white'}`}
                        >{viewing.finalPaymentPaid? 'Marcar No pagado':'Marcar Pagado'}</button>
                      </div>
                    </>
                  );
                })()}
                <div><span className="text-gray-600">Total:</span> <span className="font-medium">R$ {computeAmounts(viewing).totalAmount.toFixed(0)}</span></div>
                <div><span className="text-gray-600">Deslocamento:</span> <span className="font-medium">R$ {(viewing.travelFee ?? 0).toFixed(0)}</span></div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Items del contrato</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th className="py-1">Item</th>
                        <th className="py-1">Cant.</th>
                        <th className="py-1">Precio</th>
                        <th className="py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewing.services || []).map((it: any, idx: number) => {
                        const qty = Number(it.quantity ?? 1);
                        const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
                        const total = price * qty;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="py-1">{it.name || it.id || '—'}</td>
                            <td className="py-1">{qty}</td>
                            <td className="py-1">R$ {price.toFixed(0)}</td>
                            <td className="py-1">R$ {total.toFixed(0)}</td>
                          </tr>
                        );
                      })}
                      {Array.isArray(viewing.storeItems) && viewing.storeItems.map((it: any, idx: number) => (
                        <tr key={`store-${idx}`} className="border-t">
                          <td className="py-1">{it.name}</td>
                          <td className="py-1">{Number(it.quantity)}</td>
                          <td className="py-1">R$ {Number(it.price).toFixed(0)}</td>
                          <td className="py-1">R$ {(Number(it.price) * Number(it.quantity)).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewing.message && (
                <div>
                  <div className="text-sm font-medium mb-1">Mensaje del cliente</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{viewing.message}</div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={scheduleFinalPaymentEmail} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Programar email de saldo (−30 min)</button>
                {viewing.reminders?.find(r=>r.type==='finalPayment') && (
                  <span className="text-xs text-gray-600">Programado para: {new Date(viewing.reminders.find(r=>r.type==='finalPayment')!.sendAt).toLocaleString('es-ES')}</span>
                )}
              </div>

              {Array.isArray((viewing as any).formSnapshot?.selectedDresses) && (viewing as any).formSnapshot.selectedDresses.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Vestidos seleccionados</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {((viewing as any).formSnapshot.selectedDresses as string[])
                      .map(id => dressOptions.find(d => d.id === id))
                      .filter(Boolean)
                      .map(dress => (
                        <div key={(dress as any).id} className="text-center">
                          <div className="relative aspect-[9/16] overflow-hidden rounded-lg mb-1 bg-gray-100">
                            {(dress as any).image && <img loading="lazy" src={(dress as any).image} alt={(dress as any).name} className="absolute inset-0 w-full h-full object-cover" />}
                          </div>
                          <div className="text-xs font-medium text-gray-800 truncate">{(dress as any).name}</div>
                          {(dress as any).color && <div className="text-[10px] text-gray-500">{(dress as any).color}</div>}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {viewing.formSnapshot && (
                <div>
                  <div className="text-sm font-medium mb-1">Formulario (resumen)</div>
                  <div className="text-xs text-gray-600 grid grid-cols-2 gap-2">
                    {Object.entries(viewing.formSnapshot).slice(0, 30).map(([k,v])=> (
                      <div key={k}><span className="text-gray-500">{k}:</span> <span className="text-gray-800">{String(v)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    {templatesOpen && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setTemplatesOpen(false)}>
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-5xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b">
            <div className="font-medium">Editor de Workflows</div>
            <button onClick={()=>setTemplatesOpen(false)} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3">
            <div className="md:col-span-1 border-r p-3 space-y-2 max-h-[70vh] overflow-auto">
              <button onClick={()=> setTplEditing({ id: '', name: 'Nuevo workflow', categories: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })} className="w-full border px-2 py-2 rounded-none inline-flex items-center gap-2"><Plus size={14}/> Nuevo</button>
              {templates.map(t=> (
                <button key={t.id} onClick={()=> setTplEditing({ ...t })} className={`w-full text-left px-2 py-2 rounded-none border ${tplEditing?.id===t.id? 'bg-gray-100 border-black':'border-transparent hover:bg-gray-50'}`}>{t.name}</button>
              ))}
            </div>
            <div className="md:col-span-2 p-4 max-h-[70vh] overflow-auto">
              {!tplEditing ? (
                <div className="text-sm text-gray-600">Selecciona o crea un workflow para editar.</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input value={tplEditing.name} onChange={e=> setTplEditing(v=> v? { ...v, name: e.target.value }: v)} className="border px-3 py-2 rounded-none flex-1" />
                    {tplEditing.id && (
                      <button onClick={async()=>{ if (!confirm('¿Eliminar plantilla?')) return; await deleteDoc(doc(db,'workflowTemplates', tplEditing.id)); await fetchTemplates(); setTplEditing(null); }} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"><Trash size={16}/> Eliminar</button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {tplEditing.categories.map((cat, ci)=> (
                      <div key={cat.id} className="border rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <input value={cat.name} onChange={e=> setTplEditing(v=>{ if(!v) return v; const cats=[...v.categories]; cats[ci] = { ...cats[ci], name: e.target.value }; return { ...v, categories: cats }; })} className="text-sm font-semibold border px-2 py-1 rounded-none" />
                          <button onClick={()=> setTplEditing(v=>{ if(!v) return v; const cats=[...v.categories]; cats.splice(ci,1); return { ...v, categories: cats }; })} className="text-red-600 hover:text-red-800" title="Eliminar categoría"><Trash size={14}/></button>
                        </div>
                        <div className="space-y-2">
                          {cat.tasks.map((t, ti)=> (
                            <div key={t.id} className="flex items-center gap-2">
                              <input value={t.title} onChange={e=> setTplEditing(v=>{ if(!v) return v; const cats=[...v.categories]; const ts=[...cats[ci].tasks]; ts[ti] = { ...ts[ti], title: e.target.value }; cats[ci] = { ...cats[ci], tasks: ts }; return { ...v, categories: cats }; })} className="text-sm border px-2 py-1 rounded-none flex-1" />
                              <button onClick={()=> setTplEditing(v=>{ if(!v) return v; const cats=[...v.categories]; const ts=cats[ci].tasks.filter((_,idx)=> idx!==ti); cats[ci] = { ...cats[ci], tasks: ts }; return { ...v, categories: cats }; })} className="text-red-600 hover:text-red-800" title="Eliminar tarea"><Trash size={14}/></button>
                            </div>
                          ))}
                          <button onClick={()=> setTplEditing(v=>{ if(!v) return v; const cats=[...v.categories]; cats[ci] = { ...cats[ci], tasks: [...cats[ci].tasks, { id: uid(), title: 'Nueva tarea', done: false }] }; return { ...v, categories: cats }; })} className="text-xs border px-2 py-1 rounded-none inline-flex items-center gap-1"><Plus size={12}/> Añadir tarea</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={()=> setTplEditing(v=> v? { ...v, categories: [...v.categories, { id: uid(), name: 'Nueva categoría', tasks: [] }] }: v)} className="border px-3 py-2 rounded-none inline-flex items-center gap-2"><Plus size={14}/> Añadir categoría</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={async()=>{
                      if (!tplEditing) return;
                      const payload = { name: tplEditing.name, categories: tplEditing.categories, createdAt: tplEditing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } as any;
                      if (tplEditing.id) {
                        await updateDoc(doc(db,'workflowTemplates', tplEditing.id), payload);
                      } else {
                        const created = await addDoc(collection(db,'workflowTemplates'), payload);
                        setTplEditing(v=> v? { ...v, id: created.id }: v);
                      }
                      await fetchTemplates();
                    }} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none">Guardar plantilla</button>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={async()=>{ if(!tplEditing?.id) return; await setDoc(doc(db,'settings','workflowDefaults'), { packages: tplEditing.id }, { merge: true }); await fetchTemplates(); }} className="border px-2 py-2 rounded-none text-sm">Definir por defecto: Paquetes</button>
                      <button onClick={async()=>{ if(!tplEditing?.id) return; await setDoc(doc(db,'settings','workflowDefaults'), { products: tplEditing.id }, { merge: true }); await fetchTemplates(); }} className="border px-2 py-2 rounded-none text-sm">Definir por defecto: Productos</button>
                      {defaults.packages && <span className="text-xs text-gray-600">Def Paquetes: {(templates.find(t=>t.id===defaults.packages)?.name) || defaults.packages}</span>}
                      {defaults.products && <span className="text-xs text-gray-600">Def Productos: {(templates.find(t=>t.id===defaults.products)?.name) || defaults.products}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    {editing && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl p-4 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Editar Contrato</h3>
            <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Nombre</label>
              <input value={editForm.clientName || ''} onChange={e => setEditForm((f: any) => ({ ...f, clientName: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Email</label>
              <input value={editForm.clientEmail || ''} onChange={e => setEditForm((f: any) => ({ ...f, clientEmail: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Teléfono</label>
              <input value={(editForm as any).clientPhone || ''} onChange={e => setEditForm((f: any) => ({ ...f, clientPhone: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Tipo de evento</label>
              <input value={editForm.eventType || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventType: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Ubicación</label>
              <input value={editForm.eventLocation || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventLocation: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Fecha evento</label>
              <input type="date" value={editForm.eventDate || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventDate: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Hora</label>
              <input type="time" value={editForm.eventTime || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventTime: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>

            <div>
              <label className="text-xs text-gray-600">Paquete</label>
              <select value={editForm.packageTitle || ''} onChange={(e)=>{
                const title = e.target.value;
                const found = packagesList.find(p=>p.title===title);
                setEditForm((f:any)=> ({ ...f, packageTitle: title, packageDuration: found?.duration || f.packageDuration || '' }));
              }} className="w-full px-3 py-2 border rounded-none">
                <option value="">— Selecciona paquete —</option>
                {packagesList.map(p=> (<option key={p.id} value={p.title}>{p.title}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Duración</label>
              <input value={editForm.packageDuration || ''} onChange={e=> setEditForm((f:any)=> ({ ...f, packageDuration: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>

            <div>
              <label className="text-xs text-gray-600">Método de pago</label>
              <input value={editForm.paymentMethod || ''} onChange={e=> setEditForm((f:any)=> ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Total</label>
              <input type="number" step="0.01" value={editForm.totalAmount ?? 0} onChange={e => setEditForm((f: any) => ({ ...f, totalAmount: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Deslocamento</label>
              <input type="number" step="0.01" value={editForm.travelFee ?? 0} onChange={e => setEditForm((f: any) => ({ ...f, travelFee: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Notas</label>
              <textarea value={editForm.message || ''} onChange={e => setEditForm((f: any) => ({ ...f, message: e.target.value }))} className="w-full px-3 py-2 border rounded-none max-h-24" rows={2} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Cancelar</button>
            <button onClick={saveEdit} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>
    )}

    {creating && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=> setCreating(false)}>
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={e=> e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Nuevo Contrato</h3>
            <button onClick={() => setCreating(false)} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Nombre</label>
              <input value={createForm.clientName} onChange={e => setCreateForm((f: any) => ({ ...f, clientName: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Email</label>
              <input value={createForm.clientEmail} onChange={e => setCreateForm((f: any) => ({ ...f, clientEmail: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Teléfono</label>
              <input value={createForm.clientPhone} onChange={e => setCreateForm((f: any) => ({ ...f, clientPhone: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Tipo de evento</label>
              <input value={createForm.eventType} onChange={e => setCreateForm((f: any) => ({ ...f, eventType: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Ubicación</label>
              <input value={createForm.eventLocation} onChange={e => setCreateForm((f: any) => ({ ...f, eventLocation: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Fecha evento</label>
              <input type="date" value={createForm.eventDate} onChange={e => setCreateForm((f: any) => ({ ...f, eventDate: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Hora</label>
              <input type="time" value={createForm.eventTime} onChange={e => setCreateForm((f: any) => ({ ...f, eventTime: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Paquete</label>
              <select value={createForm.packageTitle} onChange={(e)=>{
                const title = e.target.value;
                const found = packagesList.find(p=>p.title===title);
                setCreateForm((f:any)=> ({ ...f, packageTitle: title, packageDuration: found?.duration || f.packageDuration || '' }));
              }} className="w-full px-3 py-2 border rounded-none">
                <option value="">— Selecciona paquete —</option>
                {packagesList.map(p=> (<option key={p.id} value={p.title}>{p.title}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Duración</label>
              <input value={createForm.packageDuration} onChange={e=> setCreateForm((f:any)=> ({ ...f, packageDuration: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Método de pago</label>
              <input value={createForm.paymentMethod} onChange={e=> setCreateForm((f:any)=> ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Total</label>
              <input type="number" step="0.01" value={createForm.totalAmount} onChange={e => setCreateForm((f: any) => ({ ...f, totalAmount: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Deslocamento</label>
              <input type="number" step="0.01" value={createForm.travelFee} onChange={e => setCreateForm((f: any) => ({ ...f, travelFee: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Notas</label>
              <textarea value={createForm.message} onChange={e => setCreateForm((f: any) => ({ ...f, message: e.target.value }))} className="w-full px-3 py-2 border rounded-none max-h-24" rows={2} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="border px-3 py-2 rounded-none">Cancelar</button>
            <button onClick={async ()=>{
              if (!createForm.clientName || !createForm.eventDate) { alert('Nombre y fecha del evento son obligatorios'); return; }
              const payload: any = {
                clientName: createForm.clientName,
                clientEmail: createForm.clientEmail || '',
                eventType: createForm.eventType || 'Evento',
                eventDate: createForm.eventDate,
                eventTime: createForm.eventTime || '00:00',
                eventLocation: createForm.eventLocation || '',
                paymentMethod: createForm.paymentMethod || 'pix',
                depositPaid: false,
                finalPaymentPaid: false,
                eventCompleted: false,
                createdAt: new Date().toISOString(),
                totalAmount: Number(createForm.totalAmount || 0) || 0,
                travelFee: Number(createForm.travelFee || 0) || 0,
                status: 'booked' as const,
                ...(createForm.packageTitle ? { packageTitle: createForm.packageTitle } : {}),
                ...(createForm.packageDuration ? { packageDuration: createForm.packageDuration } : {}),
              };
              if (createForm.clientPhone) payload.formSnapshot = { ...(payload.formSnapshot || {}), phone: createForm.clientPhone };
              await addDoc(collection(db, 'contracts'), payload);
              setCreating(false);
              setCreateForm({ clientName: '', clientEmail: '', clientPhone: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', packageTitle: '', packageDuration: '', paymentMethod: 'pix', totalAmount: 0, travelFee: 0, message: '' });
              await fetchContracts();
            }} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90">Crear</button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

export default ContractsManagement;
