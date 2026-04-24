/**
 * api.js - Updated with Management Functions
 */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvGj37hpBsS19xBcfKcj-ZkM2M865XKNeoAPkQhO_7_rajgJqHzYc4X6HXo8IYTXhp/exec'; 

const API = {
  call: async (action, data = {}) => {
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, data })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message);
      return result.data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  getAvailableTimeSlots: (date, room, success, failure) => {
    API.call('getAvailableTimeSlots', { date, room }).then(success).catch(failure);
  },

  getAvailableEndTimes: (date, room, startTime, success, failure) => {
    API.call('getAvailableEndTimes', { date, room, startTime }).then(success).catch(failure);
  },

  checkDuplicateBooking: (date, room, startTime, endTime, success, failure) => {
    API.call('checkDuplicateBooking', { date, room, startTime, endTime }).then(success).catch(failure);
  },

  saveReservation: (formData, success, failure) => {
    API.call('saveReservation', formData).then(success).catch(failure);
  },

  getReservationsByDateAndRoom: (date, room, success, failure) => {
    API.call('getReservationsByDateAndRoom', { date, room }).then(success).catch(failure);
  },

  // New Functions
  getAllReservations: (success, failure) => {
    API.call('getAllReservations').then(success).catch(failure);
  },

  cancelReservation: (reservationData, success, failure) => {
    API.call('cancelReservation', reservationData).then(success).catch(failure);
  }
};
