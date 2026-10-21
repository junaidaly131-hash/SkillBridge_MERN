import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import apiClient from '../../api/client';
import { useToast } from '../../ui/Toast';

const fieldLabels = {
  name: 'Name', email: 'Email (required)', contact_type: 'Contact type', institution: 'Institution', city: 'City', tags: 'Tags', source: 'Source',
  permission_status: 'Permission status', permission_source: 'Permission source', permission_at: 'Permission timestamp', permission_reference: 'Permission evidence/reference',
};
const initialFilters = { search: '', contactType: '', city: '', tag: '', importBatch: '', eligibility: '' };

function ExternalContactsPanel({ selectedIds = [], onSelectionChange }) {
  const { error: showError, success: showSuccess } = useToast();
  const fileRef = useRef(null);
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [imports, setImports] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [rowPagination, setRowPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [mapping, setMapping] = useState({});
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const queryString = (values, page = 1) => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  };
  const loadContacts = async (page = 1, values = appliedFilters) => {
    const { data } = await apiClient.get(`/admin/email-campaigns/external-contacts?${queryString(values, page)}`);
    setContacts(data.contacts); setPagination(data.pagination);
  };
  const loadImports = async () => {
    const { data } = await apiClient.get('/admin/email-campaigns/external-contacts/imports?limit=20');
    setImports(data.imports);
  };
  // Initial load only; subsequent loads are explicit pagination/filter actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { Promise.all([loadContacts(), loadImports()]).catch(() => showError("Couldn't load external contacts.")); }, []);

  const loadRows = async (importId, page = 1) => {
    const { data } = await apiClient.get(`/admin/email-campaigns/external-contacts/imports/${importId}/rows?page=${page}&limit=25`);
    setPreviewRows(data.rows); setRowPagination(data.pagination);
  };
  const uploadCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file);
      // apiClient defaults to application/json. Override it here so Axios keeps
      // the FormData payload intact and the browser adds the multipart boundary.
      const { data } = await apiClient.post(
        '/admin/email-campaigns/external-contacts/imports/preview',
        body,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setPreview(data.import); setMapping(data.import.mapping || {}); await loadRows(data.import.id); await loadImports();
      showSuccess('CSV preview created. No contacts were changed.');
    } catch (error) { showError(error.response?.data?.message || "Couldn't preview this CSV."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const remap = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/admin/email-campaigns/external-contacts/imports/${preview.id}/remap`, { mapping });
      setPreview(data.import); setMapping(data.import.mapping); await loadRows(preview.id); showSuccess('Preview updated with the new mapping.');
    } catch (error) { showError(error.response?.data?.message || "Couldn't update mapping."); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/admin/email-campaigns/external-contacts/imports/${preview.id}/confirm`);
      setPreview(data.import); setPreviewRows([]); await Promise.all([loadContacts(1), loadImports()]); showSuccess(`${data.import.counts.inserted} contacts imported. Existing contacts were left unchanged.`);
    } catch (error) { showError(error.response?.data?.message || "Couldn't confirm import."); }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await apiClient.patch(`/admin/email-campaigns/external-contacts/${editing._id}`, {
        name: editing.name, email: editing.email, contactType: editing.contactType, institution: editing.institution,
        city: editing.city, source: editing.source, tags: String(editing.tagsText || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        permission: editing.permission?.status === 'documented' ? { ...editing.permission, at: new Date(editing.permission.at).toISOString() } : editing.permission,
      });
      setEditing(null); await loadContacts(pagination.page); showSuccess('External contact updated.');
    } catch (error) { showError(error.response?.data?.message || "Couldn't update contact."); }
    finally { setBusy(false); }
  };
  const remove = async (contact) => {
    if (!window.confirm(`Delete ${contact.name || contact.normalizedEmail}? Suppression history will be preserved.`)) return;
    try { const { data } = await apiClient.delete(`/admin/email-campaigns/external-contacts/${contact._id}`); await loadContacts(pagination.page); showSuccess(data.message); }
    catch (error) { showError(error.response?.data?.message || "Couldn't delete contact."); }
  };
  const applyFilters = () => { setAppliedFilters(filters); loadContacts(1, filters).catch(() => showError("Couldn't filter contacts.")); };
  const toggleSelection = (id) => {
    const next = new Set(selected); next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
    onSelectionChange?.([...next]);
  };
  const selectAllFiltered = async () => {
    try {
      const { data } = await apiClient.post('/admin/email-campaigns/external-contacts/resolve-audience', { filters: appliedFilters });
      onSelectionChange?.(data.ids.map(String)); showSuccess(`${data.count} unique eligible external contacts selected from all filtered results.`);
    } catch (error) { showError(error.response?.data?.message || "Couldn't resolve filtered contacts."); }
  };
  const downloadErrors = async (item) => {
    try {
      const { data } = await apiClient.get(`/admin/email-campaigns/external-contacts/imports/${item.id}/errors.csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `import-${item.id}-errors.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch { showError("Couldn't download the import error report."); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Import external contacts</h2><p className="mt-1 text-sm text-gray">CSV uploads create a private preview first. Importing never creates accounts or sends email.</p></div><div className="flex flex-wrap gap-2"><a href="/api/admin/email-campaigns/external-contacts/sample.csv" onClick={(event) => { event.preventDefault(); apiClient.get('/admin/email-campaigns/external-contacts/sample.csv', { responseType: 'blob' }).then(({ data }) => { const url=URL.createObjectURL(data); const anchor=document.createElement('a'); anchor.href=url; anchor.download='skillbridge-external-contacts-sample.csv'; anchor.click(); URL.revokeObjectURL(url); }); }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"><Download size={17}/>Sample CSV</a><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-teal-button px-4 py-2.5 text-sm font-semibold text-white"><FileUp size={17}/>{busy?'Working…':'Choose CSV'}<input ref={fileRef} type="file" accept=".csv,text/csv" onChange={uploadCsv} className="hidden" disabled={busy}/></label></div></div>
      <p className="mt-3 text-xs text-gray">UTF-8 CSV · max 2 MiB · max 2,000 rows · unknown permission is stored but cannot receive campaigns.</p>
    </section>

    {preview?.state === 'preview' && <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">Review import preview</h2><p className="text-sm text-gray">{preview.filename} · expires {new Date(preview.expiresAt).toLocaleString()}</p></div><button onClick={()=>setPreview(null)} className="rounded-lg p-2 hover:bg-light-bg" aria-label="Close preview"><X size={20}/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">{[['Rows','total'],['Valid new','validNew'],['Existing','existing'],['Duplicates','duplicate'],['Invalid','invalid'],['Unknown','permissionUnknown'],['Restricted','restrictedMatches']].map(([label,key])=><div key={key} className="rounded-xl bg-light-bg p-3"><strong className="text-xl">{preview.counts?.[key]||0}</strong><p className="text-xs text-gray">{label}</p></div>)}</div>
      <h3 className="mt-5 font-bold">Header mapping</h3><div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(fieldLabels).map(([field,label])=><label key={field} className="text-xs font-semibold">{label}<select value={mapping[field]||''} onChange={(event)=>setMapping({...mapping,[field]:event.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"><option value="">Not mapped</option>{preview.headers.map((header)=><option key={header} value={header}>{header}</option>)}</select></label>)}</div><button onClick={remap} disabled={busy||!mapping.email} className="mt-3 rounded-lg border border-teal px-4 py-2 text-sm font-semibold text-teal disabled:opacity-40">Apply mapping</button>
      <div className="mt-5 overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-light-bg"><tr><th className="p-3">Row</th><th>Email</th><th>Name</th><th>Result</th><th>Details</th></tr></thead><tbody>{previewRows.map((row)=><tr key={row.rowNumber} className="border-t"><td className="p-3">{row.rowNumber}</td><td>{row.value?.normalizedEmail||'—'}</td><td>{row.value?.name||'—'}</td><td className="capitalize">{row.classification.replace('_',' ')}</td><td className="max-w-sm text-xs text-gray">{[...(row.errors||[]),...(row.warnings||[])].join(' ')||'Ready'}</td></tr>)}</tbody></table></div>
      {rowPagination.pages>1&&<div className="mt-3 flex items-center justify-between text-sm"><button disabled={rowPagination.page<=1} onClick={()=>loadRows(preview.id,rowPagination.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {rowPagination.page} of {rowPagination.pages}</span><button disabled={rowPagination.page>=rowPagination.pages} onClick={()=>loadRows(preview.id,rowPagination.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
      <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={confirm} disabled={busy||!preview.counts?.validNew} className="rounded-xl bg-dark-blue px-5 py-3 font-semibold text-white disabled:opacity-40">Confirm valid new contacts</button><span className="text-xs text-gray">Existing and duplicate contacts will be skipped; nothing is overwritten.</span></div>
    </section>}

    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">External contacts</h2><p className="mt-1 text-sm text-gray">{pagination.total} matching contacts · {selected.size} selected for the open campaign. Permission and suppression are checked server-side.</p></div><div className="flex flex-wrap gap-2"><button onClick={selectAllFiltered} disabled={!onSelectionChange} className="rounded-lg bg-light-teal px-3 py-2 text-sm font-semibold text-teal disabled:opacity-40">Select all eligible filtered</button><button onClick={()=>onSelectionChange?.([])} disabled={!selected.size} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Clear selection</button><button onClick={()=>loadContacts(pagination.page)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15}/>Refresh</button></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(115px,1fr))_auto]"><input value={filters.search} onChange={(e)=>setFilters({...filters,search:e.target.value})} placeholder="Search name, email, institution" className="rounded-xl border px-3 py-2.5"/><select value={filters.contactType} onChange={(e)=>setFilters({...filters,contactType:e.target.value})} className="rounded-xl border px-3 py-2.5"><option value="">All types</option>{['student','teacher','both','other','unknown'].map(v=><option key={v}>{v}</option>)}</select><input value={filters.city} onChange={(e)=>setFilters({...filters,city:e.target.value})} placeholder="City" className="rounded-xl border px-3 py-2.5"/><input value={filters.tag} onChange={(e)=>setFilters({...filters,tag:e.target.value})} placeholder="Tag" className="rounded-xl border px-3 py-2.5"/><select value={filters.importBatch} onChange={(e)=>setFilters({...filters,importBatch:e.target.value})} className="rounded-xl border px-3 py-2.5"><option value="">All imports</option>{imports.filter((item)=>['completed','partial'].includes(item.state)).map((item)=><option key={item.id} value={item.id}>{item.filename}</option>)}</select><select value={filters.eligibility} onChange={(e)=>setFilters({...filters,eligibility:e.target.value})} className="rounded-xl border px-3 py-2.5"><option value="">All eligibility</option><option value="eligible">Eligible</option><option value="unknown">Permission unknown</option><option value="restricted">Restricted</option><option value="unsubscribed">Unsubscribed</option></select><button onClick={applyFilters} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-button px-4 py-2.5 font-semibold text-white"><Search size={17}/>Filter</button></div>
      <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-light-bg"><tr><th className="p-3">Select</th><th>Contact</th><th>Type</th><th>Institution / city</th><th>Tags</th><th>Permission</th><th>Source</th><th>Imported</th><th className="text-right">Actions</th></tr></thead><tbody>{contacts.map((contact)=><tr key={contact._id} className="border-t align-top"><td className="p-3"><input type="checkbox" className="h-4 w-4 accent-teal" disabled={!contact.eligibility?.eligible||!onSelectionChange} checked={selected.has(String(contact._id))} onChange={()=>toggleSelection(contact._id)} title={contact.eligibility?.eligible?'Select for campaign':contact.eligibility?.skipReason?.replaceAll('_',' ')}/></td><td><strong>{contact.name||'Unnamed'}</strong><div className="text-xs text-gray">{contact.normalizedEmail}</div></td><td className="capitalize">{contact.contactType}</td><td>{contact.institution||'—'}<div className="text-xs text-gray">{contact.city||'—'}</div></td><td>{contact.tags?.join(', ')||'—'}</td><td><span title={contact.eligibility?.eligible?'Eligible for marketing':contact.eligibility?.skipReason?.replaceAll('_',' ')} className={`rounded-full px-2 py-1 text-xs font-semibold ${contact.eligibility?.eligible?'bg-light-teal text-teal':'bg-gray-100 text-gray-700'}`}>{contact.eligibility?.eligible?'Eligible':contact.eligibility?.skipReason?.replaceAll('_',' ')}</span></td><td className="max-w-40 truncate" title={contact.source}>{contact.source||'—'}</td><td>{new Date(contact.createdAt).toLocaleDateString()}</td><td><div className="flex justify-end gap-1"><button onClick={()=>setEditing({...contact,tagsText:(contact.tags||[]).join(', ')})} className="rounded-lg p-2 hover:bg-light-bg" aria-label="Edit contact"><Pencil size={16}/></button><button onClick={()=>remove(contact)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Delete contact"><Trash2 size={16}/></button></div></td></tr>)}{!contacts.length&&<tr><td colSpan="9" className="p-8 text-center text-gray">No contacts match these filters.</td></tr>}</tbody></table></div>
      {pagination.pages>1&&<div className="mt-4 flex items-center justify-between text-sm"><button disabled={pagination.page<=1} onClick={()=>loadContacts(pagination.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button disabled={pagination.page>=pagination.pages} onClick={()=>loadContacts(pagination.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
    </section>

    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Import history</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">File</th><th>Status</th><th>Rows</th><th>Inserted</th><th>Skipped</th><th>Created</th><th>Errors</th></tr></thead><tbody>{imports.map((item)=><tr key={item.id} className="border-b last:border-0"><td className="p-3">{item.filename}</td><td className="capitalize">{item.state}</td><td>{item.counts?.total||0}</td><td>{item.counts?.inserted||0}</td><td>{item.counts?.skipped||0}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.errorSummary?.length?<button className="text-teal underline" onClick={()=>downloadErrors(item)}>Download CSV</button>:'—'}</td></tr>)}</tbody></table></div></section>

    {editing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Edit external contact</h2><button onClick={()=>setEditing(null)} className="p-2"><X/></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['name','Name'],['email','Email'],['institution','Institution'],['city','City'],['source','Source'],['tagsText','Tags (comma separated)']].map(([key,label])=><label key={key} className="text-sm font-semibold">{label}<input value={editing[key]||''} onChange={(e)=>setEditing({...editing,[key]:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"/></label>)}<label className="text-sm font-semibold">Contact type<select value={editing.contactType} onChange={(e)=>setEditing({...editing,contactType:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal">{['student','teacher','both','other','unknown'].map(v=><option key={v}>{v}</option>)}</select></label><label className="text-sm font-semibold">Permission<select value={editing.permission?.status||'unknown'} onChange={(e)=>setEditing({...editing,permission:{...editing.permission,status:e.target.value}})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"><option value="unknown">Unknown</option><option value="documented">Documented</option><option value="unsubscribed">Unsubscribed</option></select></label>{editing.permission?.status==='documented'&&<><label className="text-sm font-semibold">Permission source<input value={editing.permission?.source||''} onChange={(e)=>setEditing({...editing,permission:{...editing.permission,source:e.target.value}})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"/></label><label className="text-sm font-semibold">Permission timestamp<input type="datetime-local" value={editing.permission?.at?new Date(editing.permission.at).toISOString().slice(0,16):''} onChange={(e)=>setEditing({...editing,permission:{...editing.permission,at:e.target.value}})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"/></label><label className="text-sm font-semibold sm:col-span-2">Evidence/reference<input value={editing.permission?.reference||''} onChange={(e)=>setEditing({...editing,permission:{...editing.permission,reference:e.target.value}})} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"/></label></>}</div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setEditing(null)} className="rounded-xl border px-4 py-2.5">Cancel</button><button onClick={saveEdit} disabled={busy} className="rounded-xl bg-dark-blue px-4 py-2.5 font-semibold text-white">Save contact</button></div></div></div>}
  </div>;
}

export default ExternalContactsPanel;
