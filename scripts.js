document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('bookingForm');
  const dateInput = document.getElementById('date');
  const submitBtn = document.getElementById('submitBtn');
  
  const ROOM_MAP = {
    'ROOM_A': 'ห้องประชุมชั้น 1',
    'ROOM_B': 'ห้องประชุมชั้น 2',
    'ROOM_C': 'ห้องประชุมชั้น 3',
    'ROOM_D': 'ห้องประชุมชั้น 4',
    'ROOM_E': 'ห้องประชุมชั้น 5'
  };

  const tabBook = document.getElementById('tabBook');
  const tabList = document.getElementById('tabList');
  const bookingSection = document.getElementById('bookingSection');
  const listSection = document.getElementById('listSection');
  const resList = document.getElementById('resList');
  const listLoader = document.getElementById('listLoader');
  const noData = document.getElementById('noData');

  const todayStr = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', todayStr);
  dateInput.value = todayStr;

  let currentDayReservations = []; // Store reservations locally for speed

  // --- Initialize Custom Selects ---
  initCustomSelect('roomSelect', (val) => {
    fetchDailyReservations();
  });
  initCustomSelect('startTimeSelect', (val) => {
    calculateEndSlotsLocally(val);
  });
  initCustomSelect('endTimeSelect');
  initCustomSelect('monthFilterSelect', (val) => {
    loadReservations();
  });

  initMonthFilterOptions();

  // --- Tab Logic ---
  tabBook.addEventListener('click', () => switchTab('book'));
  tabList.addEventListener('click', () => switchTab('list'));

  function switchTab(target) {
    if (target === 'book') {
      tabBook.classList.add('active');
      tabList.classList.remove('active');
      bookingSection.classList.add('active');
      listSection.classList.remove('active');
    } else {
      tabBook.classList.remove('active');
      tabList.classList.add('active');
      bookingSection.classList.remove('active');
      listSection.classList.add('active');
      loadReservations();
    }
  }

  // --- Booking Optimization Logic ---
  dateInput.addEventListener('change', fetchDailyReservations);
  form.addEventListener('submit', handleSubmit);

  function fetchDailyReservations() {
    const room = document.getElementById('roomInput').value;
    const date = dateInput.value;
    if (!room || !date) return;

    const startTimeSelect = document.getElementById('startTimeSelect');
    const startTimeSelected = startTimeSelect.querySelector('.select-selected');
    const startTimeInput = document.getElementById('startTimeInput');
    
    startTimeSelect.classList.add('disabled');
    startTimeSelected.textContent = 'กำลังโหลด...';
    document.getElementById('startTimeLoader').style.display = 'block';

    // Fetch data ONCE for both dropdowns
    API.getReservationsByDateAndRoom(date, room, (data) => {
      document.getElementById('startTimeLoader').style.display = 'none';
      currentDayReservations = data; // Cache locally
      calculateStartSlotsLocally();
    }, (err) => {
      document.getElementById('startTimeLoader').style.display = 'none';
      showStatusModal('error', 'ข้อผิดพลาด', err);
    });
  }

  function calculateStartSlotsLocally() {
    const startTimeSelect = document.getElementById('startTimeSelect');
    const items = startTimeSelect.querySelector('.select-items');
    const selected = startTimeSelect.querySelector('.select-selected');
    const input = document.getElementById('startTimeInput');

    items.innerHTML = '';
    input.value = '';

    const allSlots = [];
    for (let h = 8; h <= 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }

    const booked = new Set();
    currentDayReservations.forEach(res => {
      const startMin = timeToMin(res.startTime);
      const endMin = timeToMin(res.endTime);
      allSlots.forEach(slot => {
        const slotMin = timeToMin(slot);
        if (slotMin >= startMin && slotMin < endMin) booked.add(slot);
      });
    });

    const available = allSlots.filter(s => !booked.has(s));

    if (available.length === 0) {
      selected.textContent = 'ไม่มีเวลาว่าง';
    } else {
      selected.textContent = '-- เลือกเวลาเริ่ม --';
      available.forEach(slot => {
        const div = document.createElement('div');
        div.setAttribute('data-value', slot);
        div.textContent = slot + ' น.';
        items.appendChild(div);
      });
      startTimeSelect.classList.remove('disabled');
    }

    // Reset End Time
    const endTimeSelect = document.getElementById('endTimeSelect');
    endTimeSelect.classList.add('disabled');
    endTimeSelect.querySelector('.select-selected').textContent = 'กรุณาเลือกเวลาเริ่มก่อน';
    document.getElementById('endTimeInput').value = '';
  }

  function calculateEndSlotsLocally(startTime) {
    const endTimeSelect = document.getElementById('endTimeSelect');
    const items = endTimeSelect.querySelector('.select-items');
    const selected = endTimeSelect.querySelector('.select-selected');
    const input = document.getElementById('endTimeInput');

    items.innerHTML = '';
    input.value = '';

    const allSlots = [];
    for (let h = 8; h <= 20; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 20 && m > 0) break;
        allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }

    const startMin = timeToMin(startTime);
    let nextStart = 1200; // 20:00 (20 * 60)
    
    currentDayReservations.forEach(res => {
      const resStart = timeToMin(res.startTime);
      if (resStart > startMin && resStart < nextStart) nextStart = resStart;
    });

    const available = allSlots.filter(s => {
      const m = timeToMin(s);
      return m > startMin && m <= nextStart;
    });

    if (available.length === 0) {
      selected.textContent = 'ไม่มีเวลาว่าง';
    } else {
      selected.textContent = '-- เลือกเวลาสิ้นสุด --';
      available.forEach(slot => {
        const div = document.createElement('div');
        div.setAttribute('data-value', slot);
        div.textContent = slot + ' น.';
        items.appendChild(div);
      });
      endTimeSelect.classList.remove('disabled');
    }
  }

  function timeToMin(t) {
    const p = t.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const formData = {
      room: document.getElementById('roomInput').value,
      date: dateInput.value,
      startTime: document.getElementById('startTimeInput').value,
      endTime: document.getElementById('endTimeInput').value,
      name: document.getElementById('name').value,
      phone: document.getElementById('phone').value
    };

    if (!formData.room || !formData.startTime || !formData.endTime) {
      showStatusModal('error', 'ข้อมูลไม่ครบ', 'กรุณาเลือกห้องและเวลาให้ครบถ้วน');
      return;
    }

    showStatusModal('loading', 'กำลังบันทึก...', 'กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลการจองของคุณ');
    submitBtn.disabled = true;

    API.checkDuplicateBooking(formData.date, formData.room, formData.startTime, formData.endTime, (res) => {
      if (res.isDuplicate) {
        showStatusModal('error', 'จองไม่สำเร็จ', `ขออภัย เวลานี้ถูกจองไปแล้วโดยคุณ "${res.name}" กรุณาเลือกเวลาอื่น`);
        submitBtn.disabled = false;
        return;
      }
      API.saveReservation(formData, (result) => {
        showStatusModal('success', 'บันทึกสำเร็จ!', 'การจองห้องของคุณได้รับการยืนยันเรียบร้อยแล้ว');
        form.reset();
        resetCustomSelects();
        dateInput.value = todayStr;
        submitBtn.disabled = false;
      }, (err) => {
        showStatusModal('error', 'เกิดข้อผิดพลาด', err);
        submitBtn.disabled = false;
      });
    }, (err) => {
      showStatusModal('error', 'เกิดข้อผิดพลาด', err);
      submitBtn.disabled = false;
    });
  }

  // --- Custom Select Logic ---
  function initCustomSelect(id, onChange) {
    const wrapper = document.getElementById(id);
    const selected = wrapper.querySelector('.select-selected');
    const items = wrapper.querySelector('.select-items');
    const input = wrapper.querySelector('input[type="hidden"]');

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSelect(wrapper);
      wrapper.classList.toggle('active');
      items.classList.toggle('select-hide');
    });

    items.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-value')) {
        const val = e.target.getAttribute('data-value');
        const text = e.target.textContent;
        selected.textContent = text;
        input.value = val;
        items.classList.add('select-hide');
        wrapper.classList.remove('active');
        
        items.querySelectorAll('div').forEach(div => div.classList.remove('same-as-selected'));
        e.target.classList.add('same-as-selected');

        if (onChange) onChange(val);
      }
    });
  }

  function closeAllSelect(elmnt) {
    const x = document.getElementsByClassName('select-items');
    const y = document.getElementsByClassName('custom-select');
    for (let i = 0; i < y.length; i++) {
      if (elmnt == y[i]) continue;
      y[i].classList.remove('active');
    }
    for (let i = 0; i < x.length; i++) {
      x[i].classList.add('select-hide');
    }
  }

  document.addEventListener('click', () => closeAllSelect());

  function resetCustomSelects() {
    const ids = ['roomSelect', 'startTimeSelect', 'endTimeSelect'];
    ids.forEach(id => {
      const w = document.getElementById(id);
      w.querySelector('input[type="hidden"]').value = '';
      const sel = w.querySelector('.select-selected');
      if (id === 'roomSelect') sel.textContent = '-- กรุณาเลือกห้อง --';
      else if (id === 'startTimeSelect') sel.textContent = 'กรุณาเลือกห้องและวันที่ก่อน';
      else sel.textContent = 'กรุณาเลือกเวลาเริ่มก่อน';
      w.classList.add('disabled');
      if (id === 'roomSelect') w.classList.remove('disabled');
    });
  }

  function initMonthFilterOptions() {
    const filterSelect = document.getElementById('monthFilterSelect');
    const items = filterSelect.querySelector('.select-items');
    const selected = filterSelect.querySelector('.select-selected');
    const input = document.getElementById('monthFilter');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentYYYYMM = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;
    
    items.innerHTML = '';
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    for (let year = currentYear; year <= currentYear + 1; year++) {
      for (let month = 0; month < 12; month++) {
        const val = `${year}-${(month + 1).toString().padStart(2, '0')}`;
        const text = `${months[month]} ${year + 543}`;
        const div = document.createElement('div');
        div.setAttribute('data-value', val);
        div.textContent = text;
        if (val === currentYYYYMM) {
          div.classList.add('same-as-selected');
          selected.textContent = text;
          input.value = val;
        }
        items.appendChild(div);
      }
    }
  }

  // --- List & Management Logic ---
  function loadReservations() {
    resList.innerHTML = '';
    listLoader.style.display = 'flex';
    noData.style.display = 'none';
    const selectedValue = document.getElementById('monthFilter').value;

    API.getAllReservations((data) => {
      listLoader.style.display = 'none';
      const filteredData = data.filter(item => item.date.startsWith(selectedValue));
      if (!filteredData || filteredData.length === 0) {
        noData.style.display = 'block';
        return;
      }
      const groups = {};
      filteredData.forEach(item => {
        if (!groups[item.date]) groups[item.date] = [];
        groups[item.date].push(item);
      });
      Object.keys(groups).sort().forEach(date => {
        const header = document.createElement('div');
        header.className = 'date-header';
        header.innerHTML = `📅 วันที่ ${formatThaiFullDate(date)}`;
        resList.appendChild(header);
        groups[date].forEach(item => {
          const card = document.createElement('div');
          card.className = 'res-card';
          const roomDisplayName = ROOM_MAP[item.room] || item.room;
          card.innerHTML = `
            <span class="card-room">🏛️ ${roomDisplayName}</span>
            <div class="card-time">⏰ <b>${item.startTime} - ${item.endTime} น.</b></div>
            <div class="card-info">
              <div>👤 ผู้จอง: <b>${item.name}</b></div>
              <div>📞 เบอร์โทร: <b>${item.phone}</b></div>
            </div>
            <div class="card-actions">
              <button class="big-cancel-btn" data-res='${JSON.stringify(item)}'>❌ ยกเลิกการจอง</button>
            </div>
          `;
          resList.appendChild(card);
        });
      });
      document.querySelectorAll('.big-cancel-btn').forEach(btn => btn.addEventListener('click', handleCancel));
    }, (err) => {
      listLoader.style.display = 'none';
      showStatusModal('error', 'โหลดข้อมูลไม่สำเร็จ', err);
    });
  }

  function handleCancel(e) {
    const btn = e.target.closest('.big-cancel-btn');
    const resData = JSON.parse(btn.getAttribute('data-res'));
    const roomName = ROOM_MAP[resData.room] || resData.room;
    showConfirmModal('ยืนยันการยกเลิก', `คุณต้องการยกเลิกการจองที่ ${roomName} เวลา ${resData.startTime} น. ใช่หรือไม่?`, () => {
      btn.disabled = true;
      btn.textContent = '⏳ กำลังยกเลิก...';
      API.cancelReservation(resData, (result) => {
        showStatusModal('success', 'สำเร็จ', result.message);
        loadReservations();
      }, (err) => {
        showStatusModal('error', 'ยกเลิกไม่สำเร็จ', err);
        btn.disabled = false;
        btn.textContent = '❌ ยกเลิกการจอง';
      });
    });
  }

  function formatThaiFullDate(dateStr) {
    const d = new Date(dateStr);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  }

  // --- Modal Logic ---
  const statusModal = document.getElementById('statusModal');
  const confirmModal = document.getElementById('confirmModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  let confirmCallback = null;

  function showStatusModal(type, title, message) {
    statusModal.classList.add('active');
    document.getElementById('modalIcon').className = 'modal-icon ' + type;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    modalCloseBtn.style.display = (type === 'loading') ? 'none' : 'block';
  }

  function showConfirmModal(title, message, onConfirm) {
    confirmModal.classList.add('active');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = onConfirm;
  }

  modalCloseBtn.addEventListener('click', () => statusModal.classList.remove('active'));
  document.getElementById('confirmNoBtn').addEventListener('click', () => confirmModal.classList.remove('active'));
  document.getElementById('confirmYesBtn').addEventListener('click', () => {
    confirmModal.classList.remove('active');
    if (confirmCallback) confirmCallback();
  });
});
