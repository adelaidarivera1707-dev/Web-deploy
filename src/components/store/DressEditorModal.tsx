import { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Check } from 'lucide-react';
import { db, storage } from '../../utils/firebaseClient';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface DressData {
  id?: string;
  name: string;
  color?: string;
  image_url?: string;
  active?: boolean;
}

interface DressEditorModalProps {
  open: boolean;
  onClose: () => void;
  dress: DressData | null;
  onSaved: () => void;
}

const DressEditorModal: React.FC<DressEditorModalProps> = ({ open, onClose, dress, onSaved }) => {
  const [form, setForm] = useState<DressData>({ name: '', color: '', image_url: '', active: true });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (dress) {
      setForm({ id: dress.id, name: dress.name || '', color: dress.color || '', image_url: dress.image_url || '', active: dress.active !== false });
    } else {
      setForm({ name: '', color: '', image_url: '', active: true });
    }
  }, [open, dress]);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const key = `dresses/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const r = ref(storage, key);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setForm(prev => ({ ...prev, image_url: url }));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      const payload: any = {
        name: form.name || 'Vestido',
        image_url: form.image_url || '',
        category: 'vestidos',
        tags: form.color ? [form.color] : [],
        price: 0,
        active: form.active !== false,
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        await updateDoc(doc(db, 'products', form.id), payload);
      } else {
        await addDoc(collection(db, 'products'), { ...payload, created_at: new Date().toISOString() });
      }
      onSaved();
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: form.id ? 'Vestido actualizado' : 'Vestido creado', type: 'success', refresh: true } }));
      onClose();
    } catch (e) {
      console.error('Error saving dress', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo guardar el vestido', type: 'error' } }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.id) return onClose();
    try {
      setSaving(true);
      await deleteDoc(doc(db, 'products', form.id));
      onSaved();
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Vestido eliminado', type: 'success', refresh: true } }));
      onClose();
    } catch (e) {
      console.error('Error deleting dress', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo eliminar el vestido', type: 'error' } }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{form.id ? 'Editar Vestido' : 'Agregar Vestido'}</h3>
          <button onClick={onClose} className="p-2 rounded-none border border-black text-black hover:bg-black hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-none" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Color</label>
            <input value={form.color || ''} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full px-3 py-2 border rounded-none" placeholder="Ej: Azul, Verde" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Imagen</label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center text-gray-500 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <Upload size={18} className="inline mr-2" /> Subir imagen (JPG, PNG, WebP)
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files && e.target.files[0] && handleUpload(e.target.files[0])} />
            </div>
            {uploading && <div className="text-sm text-gray-500 mt-2">Subiendo...</div>}
            {form.image_url && (
              <div className="mt-3 relative">
                <img src={form.image_url} alt="preview" className="w-full h-48 object-cover rounded" />
                <button className="absolute top-2 right-2 bg-white border-2 border-black text-black rounded-none p-1 hover:bg-black hover:text-white" onClick={() => setForm({ ...form, image_url: '' })}>
                  <X size={14} />
                </button>
              </div>
            )}
            <input
              placeholder="o pega la URL manualmente"
              value={form.image_url || ''}
              onChange={e => setForm({ ...form, image_url: e.target.value })}
              className="mt-2 w-full px-3 py-2 border rounded"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.active} onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))} /> Activo</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {form.id && (
              <button onClick={remove} disabled={saving} className="px-4 py-2 border-2 border-red-600 text-red-600 rounded-none hover:bg-red-600 hover:text-white flex items-center gap-2"><Trash2 size={16} /> Eliminar</button>
            )}
            <button onClick={save} disabled={saving} className="px-4 py-2 border-2 border-black text-black rounded-none hover:bg-black hover:text-white flex items-center gap-2"><Check size={16} /> Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DressEditorModal;
