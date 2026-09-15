// Shared user edit fields — used by the Users list DataManager form
// and the User detail page edit dialog (both call user/update).
export const USER_FORM_FIELDS = [
    { name: 'name.first' },
    { name: 'name.last' },
    { name: 'phone', type: 'tel', required: true },
    { name: 'secondPhone', type: 'tel' },
    { name: 'email', type: 'email' },
]
