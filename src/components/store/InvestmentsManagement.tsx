import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

interface Investment {
  id: string;
  date: string; // ISO date (yyyy-mm-dd)
  category: 'publicidad' | 'equipo' | 'software' | 'otros';
  description: string;
  totalValue: number; // in R$
  installmentsCount: number;
  installmentValue: number;
  paymentMethod: string;
  createdAt?: string;
}

interface Installment {
  id: string;
  investmentId: string;
  installmentNumber: number; // 1..n
  amount: number;
  dueDate: string; // ISO date
  status: 'pendiente' | 'pagado';
  paidAt?: string | null;
}

const categories: Array<Investment['category']> = ['publicidad', 'equipo', 'software', 'otros'];

const InvestmentsManagement: React.FC = () => {
  const [items, setItems] = useState<Investment[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState<string>('');
  const [category, setCategory] = useState<Investment['category']>('publicidad');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState<string>('');
  const [count, setCount] = useState<string>('1');
  const [paymentMethod, setPaymentMethod] = useState('tarjeta');

  const perInstallment = useMemo(() => {
    const t = Number(total) || 0;
    const c = Math.max(1, Number(count) || 1);
    const base = Math.floor((t / c) * 100) / 100; // round down to cents
    return base;
  }, [total, count]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const invSnap = await getDocs(query(collection(db, 'investments')));
      const inv = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Investment[];
      const instSnap = await getDocs(query(collection(db, 'investment_installments')));
      const inst = instSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Installment[];
      setItems(inv);
      setInstallments(inst);
    } catch {
      setItems([]);
      setInstallments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const createInstallments = async (investmentId: string, startDate: string, totalAmount: number, installmentsCount: number) => {
    const c = Math.max(1, installmentsCount);
    const base = Math.floor((totalAmount / c) * 100) / 100;
    const remainder = Math.round(totalAmount * 100) - Math.round(base * 100) * c; // cents remainder
    const start = new Date(startDate);

    const batch: Promise<any>[] = [];
    for (let i = 0; i < c; i++) {
      const due = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
      // distribute remainder cents to the earliest installments
      const extraCent = i < remainder ? 0.01 : 0;
      const amount = Math.round((base + extraCent) * 100) / 100;
      batch.push(addDoc(collection(db, 'investment_installments'), {
        investmentId,
        installmentNumber: i + 1,
        amount,
        dueDate: due.toISOString().slice(0, 10),
        status: 'pendiente',
        createdAt: new Date().toISOString(),
      }));
    }
    await Promise.all(batch);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = Number(total);
    const c = Math.max(1, Number(count));
    if (!date || !description || !isFinite(t) || t <= 0 || !isFinite(c) || c <= 0) return;
    setLoading(true);
    try {
      const invRef = await addDoc(collection(db, 'investments'), {
        date,
        category,
        description,
        totalValue: t,
        installmentsCount: c,
        installmentValue: Math.round((t / c) * 100) / 100,
        paymentMethod,
        createdAt: new Date().toISOString(),
      });
      await createInstallments(invRef.id, date, t, c);
      await fetchAll();
      // toast
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Inversión registrada', type: 'success', refresh: false } }));
      // reset form
      setDate(''); setCategory('publicidad'); setDescription(''); setTotal(''); setCount('1'); setPaymentMethod('tarjeta');
    } catch (e) {
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo registrar la inversión', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (investmentId: string) => {
    const list = installments.filter(i => i.investmentId === investmentId);
    if (!list.length) return 'pendiente';
    return list.every(i => i.status === 'pagado') ? 'pagado' : 'pendiente';
  };

  const markPaid = async (installmentId: string, paid: boolean) => {
    try {
      await updateDoc(doc(db, 'investment_installments', installmentId), { status: paid ? 'pagado' : 'pendiente', paidAt: paid ? new Date().toISOString() : null });
      await fetchAll();
    } catch {}
  };

  const groupedByInvestment = useMemo(() => {
    const map = new Map<string, Installment[]>();
    for (const i of installments) {
      if (!map.has(i.investmentId)) map.set(i.investmentId, []);
      map.get(i.investmentId)!.push(i);
    }
    return map;
  }, [installments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Inversiones</h2>
      </div>

      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Fecha</label>
          <input type="date" value={date} onChange={e=> setDate(e.target.value)} className="px-3 py-2 border rounded-none" required />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Categoría</label>
          <select value={category} onChange={e=> setCategory(e.target.value as any)} className="px-3 py-2 border rounded-none">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className="text-xs text-gray-600">Producto / Descripción</label>
          <input type="text" value={description} onChange={e=> setDescription(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="Ej: Lente 50mm 1.8" required />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Valor total (R$)</label>
          <input type="number" step="0.01" min="0" value={total} onChange={e=> setTotal(e.target.value)} className="px-3 py-2 border rounded-none" required />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Número de cuotas</label>
          <input type="number" min="1" value={count} onChange={e=> setCount(e.target.value)} className="px-3 py-2 border rounded-none" required />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Valor por cuota (R$)</label>
          <input type="number" step="0.01" value={perInstallment.toFixed(2)} readOnly className="px-3 py-2 border rounded-none bg-gray-50" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Forma de pago</label>
          <input type="text" value={paymentMethod} onChange={e=> setPaymentMethod(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="tarjeta, PIX, transferencia" />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white w-full">Agregar</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Producto / Descripción</th>
              <th className="px-4 py-2">Valor total</th>
              <th className="px-4 py-2">Nº cuotas</th>
              <th className="px-4 py-2">Valor por cuota</th>
              <th className="px-4 py-2">Forma de pago</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Cuotas</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-gray-500" colSpan={9}>Sin inversiones</td>
              </tr>
            )}
            {items.map(inv => {
              const list = groupedByInvestment.get(inv.id) || [];
              const status = list.length ? (list.every(i => i.status === 'pagado') ? 'pagado' : 'pendiente') : 'pendiente';
              return (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2">{inv.date}</td>
                  <td className="px-4 py-2 capitalize">{inv.category}</td>
                  <td className="px-4 py-2">{inv.description}</td>
                  <td className="px-4 py-2">R$ {Number(inv.totalValue || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{inv.installmentsCount}</td>
                  <td className="px-4 py-2">R$ {Number(inv.installmentValue || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{inv.paymentMethod}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${status === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{status}</span>
                  </td>
                  <td className="px-4 py-2 min-w-[280px]">
                    <div className="flex flex-wrap gap-2">
                      {list.sort((a,b)=> a.installmentNumber-b.installmentNumber).map(inst => (
                        <button key={inst.id} onClick={() => markPaid(inst.id, inst.status !== 'pagado')} className={`text-xs px-2 py-1 rounded border ${inst.status==='pagado' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'}`}>
                          {inst.installmentNumber}/{inv.installmentsCount}: R$ {inst.amount.toFixed(2)} • {inst.dueDate} {inst.status==='pagado' ? '✓' : ''}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvestmentsManagement;
