// Set this only after the Apps Script deployment is authorized and verified.
window.OBA_PROFILE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw8nEkhDi6AbXXSejJh5a6UTt-yAkhhJUknvvR6XpCrw0QZtk66xNmyY5puTIK2TkrIyA/exec';
window.profileAlreadyRecorded = function () {
  const key = localStorage.getItem('oba-profile-write-key');
  return Boolean(key && localStorage.getItem('oba-profile-recorded-key') === key);
};
window.saveProfileToSheet = async function (profile) {
  if (window.profileAlreadyRecorded()) return;
  const endpoint = window.OBA_PROFILE_ENDPOINT;
  if (!endpoint) throw new Error('The profile database connection is not active yet.');
  let profileKey = localStorage.getItem('oba-profile-write-key');
  if (!/^[a-f0-9]{64}$/.test(profileKey || '')) {
    profileKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    // Persist before transmission so retries update the same row.
    localStorage.setItem('oba-profile-write-key', profileKey);
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ profileKey, consent: true, name: profile.name, role: profile.role, practiceType: profile.practiceType, practiceLocation: profile.practiceLocation }),
    redirect: 'follow',
    credentials: 'omit',
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error('The database did not accept the profile. Please retry.');
  const result = await response.json();
  if (result.ok !== true) throw new Error(result.error || 'The database could not save the profile.');
  localStorage.setItem('oba-profile-recorded-key', profileKey);
};
