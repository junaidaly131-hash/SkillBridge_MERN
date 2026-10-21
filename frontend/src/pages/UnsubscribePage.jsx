import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MailX } from 'lucide-react';
import apiClient from '../api/client';

function UnsubscribePage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, valid: false, done: false, message: '' });
  useEffect(() => {
    apiClient.get(`/email-preferences/unsubscribe/${encodeURIComponent(token)}`)
      .then(({ data }) => setState({ loading: false, valid: data.valid, done: false, message: data.message }))
      .catch((error) => setState({ loading: false, valid: false, done: false, message: error.response?.data?.message || 'This link is invalid.' }));
  }, [token]);
  const confirm = async () => {
    setState((value) => ({ ...value, loading: true }));
    try {
      const { data } = await apiClient.post(`/email-preferences/unsubscribe/${encodeURIComponent(token)}`);
      setState({ loading: false, valid: true, done: true, message: data.message });
    } catch (error) {
      setState({ loading: false, valid: false, done: false, message: error.response?.data?.message || "Couldn't update your preference." });
    }
  };
  return <main className="flex min-h-screen items-center justify-center bg-light-bg p-4 font-family-poppins"><section className="w-full max-w-lg rounded-2xl border border-[#E5E5E5] bg-white p-7 text-center shadow-sm"><img src="/assets/logo.png" alt="SkillBridge" className="mx-auto h-11"/><MailX className="mx-auto mt-8 text-teal" size={44}/><h1 className="mt-4 text-2xl font-bold">{state.done?'Preference updated':'Unsubscribe from updates'}</h1><p className="mt-3 text-sm leading-6 text-gray">{state.loading?'Checking your secure link…':state.message}</p>{!state.loading&&state.valid&&!state.done&&<button onClick={confirm} className="mt-6 w-full rounded-xl bg-dark-blue px-4 py-3 font-semibold text-white">Confirm unsubscribe</button>}<Link to="/" className="mt-5 inline-block text-sm font-semibold text-teal">Return to SkillBridge</Link></section></main>;
}

export default UnsubscribePage;
