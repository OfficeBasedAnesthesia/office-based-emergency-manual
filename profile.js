(() => {
  const storageKey = 'oba-local-profile';
  const header = document.querySelector('.site-header');
  if (!header) return;
  let profile = { name: '', role: '', practiceType: '', practiceLocation: '', signedIn: false, photo: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object') {
      profile.name = typeof saved.name === 'string' ? saved.name.slice(0, 80) : '';
      profile.role = typeof saved.role === 'string' ? saved.role.slice(0, 80) : '';
      profile.practiceType = typeof saved.practiceType === 'string' ? saved.practiceType.slice(0, 120) : '';
      profile.practiceLocation = typeof saved.practiceLocation === 'string' ? saved.practiceLocation.slice(0, 160) : '';
      profile.photo = typeof saved.photo === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(saved.photo) && saved.photo.length < 150000 ? saved.photo : '';
      profile.signedIn = saved.signedIn === true && [profile.name, profile.role, profile.practiceType, profile.practiceLocation].every(value => value.trim());
    }
  } catch { /* A fresh profile is available when storage cannot be read. */ }
  const button = document.createElement('button');
  button.className = 'profile-trigger';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open local profile');
  button.setAttribute('aria-haspopup', 'dialog');
  header.append(button);
  const sessionLabel = document.createElement('span');
  sessionLabel.className = 'profile-session-label';
  sessionLabel.setAttribute('role', 'status');
  header.append(sessionLabel);
  const dialog = document.createElement('dialog');
  dialog.className = 'profile-dialog';
  dialog.setAttribute('aria-labelledby', 'profile-title');
  dialog.innerHTML = `
    <form id="local-profile-form">
      <div class="profile-heading"><h2 id="profile-title">Your profile</h2><button type="button" class="profile-close" aria-label="Close profile">×</button></div>
      <p class="profile-description">Make this manual your own. Saving signs you in locally on this device. No online account is created.</p>
      <label for="profile-photo">Profile photo <span>(optional)</span></label>
      <div class="profile-photo-row"><img class="profile-photo-preview" alt="Selected profile photo" hidden /><button type="button" class="profile-photo-remove" hidden>Remove photo</button></div>
      <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="profile-photo-help" />
      <p id="profile-photo-help" class="profile-photo-help">Choose a JPG, PNG, or WebP (up to 8 MB). Your photo stays on this device.</p>
      <label for="profile-name">Name</label>
      <input required id="profile-name" name="name" autocomplete="name" maxlength="80" placeholder="Your name" />
      <label for="profile-role">Role</label>
      <input required id="profile-role" name="role" autocomplete="organization-title" maxlength="80" placeholder="e.g. Anesthesiologist" />
      <label for="profile-practice-type">Type of practice</label>
      <input required id="profile-practice-type" name="practiceType" maxlength="120" placeholder="e.g. Office-based anesthesia" />
      <label for="profile-practice-location">Location of practice</label>
      <input required id="profile-practice-location" name="practiceLocation" maxlength="160" placeholder="e.g. Boston, MA" />
      <label class="profile-cloud-consent" hidden><input type="checkbox" id="profile-cloud-consent" /> I agree to save my name, role, practice type, and practice location in the app operator’s private Google Sheet.</label>
      <p class="profile-status" role="status" aria-live="polite"></p>
      <div class="profile-actions"><button type="button" class="profile-cancel">Cancel</button><button type="submit" class="profile-save">Save profile &amp; sign in</button></div>
      <button type="button" class="profile-signout" hidden>Sign out</button>
    </form>`;
  document.body.append(dialog);
  const name = dialog.querySelector('#profile-name');
  const role = dialog.querySelector('#profile-role');
  const practiceType = dialog.querySelector('#profile-practice-type');
  const practiceLocation = dialog.querySelector('#profile-practice-location');
  const status = dialog.querySelector('.profile-status');
  const cloudConsent = dialog.querySelector('#profile-cloud-consent');
  const cloudEnabled = Boolean(window.OBA_PROFILE_ENDPOINT);
  function updateConsent() {
    const needsRecording = cloudEnabled && !window.profileAlreadyRecorded();
    cloudConsent.parentElement.hidden = !needsRecording;
    cloudConsent.required = needsRecording;
    dialog.querySelector('.profile-description').textContent = needsRecording
      ? 'Your first sign-in saves your profile in the app operator’s private Google Sheet. Future sign-ins stay on this device.'
      : 'Your profile is saved on this device. Later sign-ins and edits do not send your information to Google Sheets again.';
  }
  updateConsent();
  const photoInput = dialog.querySelector('#profile-photo');
  const photoPreview = dialog.querySelector('.profile-photo-preview');
  const photoRemove = dialog.querySelector('.profile-photo-remove');
  let draftPhoto = profile.photo;
  let photoVersion = 0;
  let photoLoading = false;
  function showPhoto() {
    photoPreview.hidden = !draftPhoto;
    photoRemove.hidden = !draftPhoto;
    if (draftPhoto) photoPreview.src = draftPhoto;
    else photoPreview.removeAttribute('src');
  }
  photoRemove.addEventListener('click', () => {
    photoVersion++;
    photoLoading = false;
    draftPhoto = '';
    photoInput.value = '';
    status.textContent = '';
    showPhoto();
  });
  photoInput.addEventListener('change', async () => {
    const version = ++photoVersion;
    const file = photoInput.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      status.textContent = 'Choose a JPG, PNG, or WebP image smaller than 8 MB.';
      photoInput.value = '';
      return;
    }
    photoLoading = true;
    status.textContent = 'Preparing photo…';
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (version !== photoVersion) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 160, 160);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 160, 160);
      draftPhoto = canvas.toDataURL('image/jpeg', 0.85);
      showPhoto();
      status.textContent = '';
    } catch {
      if (version === photoVersion) status.textContent = 'This image could not be opened. Please choose another photo.';
    } finally {
      URL.revokeObjectURL(url);
      if (version === photoVersion) photoLoading = false;
    }
  });
  const fields = [name, role, practiceType, practiceLocation];
  fields.forEach(field => {
    field.addEventListener('input', () => field.setCustomValidity(field.value.trim() ? '' : 'Please fill out this field.'));
    field.addEventListener('invalid', () => {
      if (!field.value.trim()) field.setCustomValidity('Please fill out this field.');
    });
  });
  function updateButton() {
    if (profile.signedIn && profile.photo) {
      const photo = document.createElement('img');
      photo.src = profile.photo;
      photo.alt = '';
      button.replaceChildren(photo);
    } else if (profile.signedIn && profile.name.trim()) {
      button.textContent = Array.from(profile.name.trim())[0].toUpperCase();
    } else {
      button.innerHTML = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
    }
    button.title = profile.signedIn ? `Signed in as ${profile.name} — Profile` : 'Your profile';
    button.setAttribute('aria-label', button.title);
    sessionLabel.textContent = profile.signedIn ? `Signed in as ${profile.name}` : '';
    dialog.querySelector('.profile-signout').hidden = !profile.signedIn;
    dialog.querySelector('.profile-save').textContent = profile.signedIn ? 'Save profile' : 'Save profile & sign in';
  }
  updateButton();
  button.addEventListener('click', () => {
    photoVersion++;
    photoLoading = false;
    draftPhoto = profile.photo;
    photoInput.value = '';
    showPhoto();
    name.value = profile.name;
    role.value = profile.role;
    practiceType.value = profile.practiceType;
    practiceLocation.value = profile.practiceLocation;
    updateConsent();
    fields.forEach(field => field.setCustomValidity(''));
    status.textContent = '';
    dialog.showModal();
    name.focus();
  });
  function close() { photoVersion++; photoLoading = false; dialog.close(); button.focus(); }
  dialog.querySelector('.profile-close').addEventListener('click', close);
  dialog.querySelector('.profile-cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', () => button.focus());
  dialog.querySelector('.profile-signout').addEventListener('click', () => {
    try {
      const next = { ...profile, signedIn: false, photo: '' };
      localStorage.setItem(storageKey, JSON.stringify(next));
      profile = next;
      updateButton();
      close();
    } catch {
      status.textContent = 'Your browser could not save the sign-out. Please try again.';
    }
  });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (photoLoading) { status.textContent = 'Please wait for your photo to finish preparing.'; return; }
    fields.forEach(field => field.setCustomValidity(field.value.trim() ? '' : 'Please fill out this field.'));
    if (!dialog.querySelector('form').reportValidity()) return;
    const next = { name: name.value.trim(), role: role.value.trim(), practiceType: practiceType.value.trim(), practiceLocation: practiceLocation.value.trim(), photo: draftPhoto, signedIn: true };
    const saveButton = dialog.querySelector('.profile-save');
    saveButton.disabled = true;
    status.textContent = cloudEnabled && !window.profileAlreadyRecorded() ? 'Saving profile…' : '';
    let localSaved = false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      localSaved = true;
      profile = next;
      updateButton();
      if (cloudEnabled) await window.saveProfileToSheet(next);
      close();
    } catch (error) {
      status.textContent = localSaved ? 'Saved on this device, but not confirmed in the database. Please retry. ' + error.message : 'Your browser could not save the profile. Please allow local storage and try again.';
    } finally {
      saveButton.disabled = false;
    }
  });
})();
