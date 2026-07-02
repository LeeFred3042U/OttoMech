import re

def swap_emojis(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Emojis in issue-grid
    html = html.replace('<span class="issue-icon">🛞</span>', '<span class="issue-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="9"></line><line x1="12" y1="15" x2="12" y2="22"></line><line x1="2" y1="12" x2="9" y2="12"></line><line x1="15" y1="12" x2="22" y2="12"></line></svg></span>')
    html = html.replace('<span class="issue-icon">🔋</span>', '<span class="issue-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><rect x="2" y="7" width="16" height="10"></rect><line x1="22" y1="11" x2="22" y2="13"></line><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line></svg></span>')
    html = html.replace('<span class="issue-icon">⚙️</span>', '<span class="issue-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>')
    html = html.replace('<span class="issue-icon">🌡️</span>', '<span class="issue-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg></span>')
    html = html.replace('<span class="issue-icon">🔧</span>', '<span class="issue-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></span>')
    
    # Mechanic avatars
    html = html.replace('<div class="mechanic-avatar">🔧</div>', '<div class="mechanic-avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>')
    
    # Landing roles
    html = html.replace('<span class="role-icon">🚗</span>', '<span class="role-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a2 2 0 0 0-1.6-.8H9.3a2 2 0 0 0-1.6.8L5 11l-5.16.86a1 1 0 0 0-.84.99V16h3m10 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0m-7 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0"></path></svg></span>')
    html = html.replace('<span class="role-icon">🔧</span>', '<span class="role-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></span>')
    
    # Success states
    html = html.replace('<div class="success-icon">✅</div>', '<div class="success-icon" style="color: var(--text-primary);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><polyline points="20 6 9 17 4 12"></polyline></svg></div>')

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)

swap_emojis('c:/CodeBase/Code/OttoMech/ottomech/frontend/templates/dashboard_user.html')
swap_emojis('c:/CodeBase/Code/OttoMech/ottomech/frontend/templates/dashboard_mechanic.html')
swap_emojis('c:/CodeBase/Code/OttoMech/ottomech/frontend/templates/index.html')

print("SVGs replaced emojis.")
