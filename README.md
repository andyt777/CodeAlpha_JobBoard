# CodeAlpha Job Board Platform

A job board backend built with **Express.js** and **SQLite**. Employers post jobs, candidates search, upload resumes and apply, and everyone gets notified as applications move forward. This is CodeAlpha Backend Development, Task 4.

## Features

- **Models**: users with employer and candidate profiles, jobs, resumes, applications, application status history, notifications
- **Job search filters**: keyword (title, description, company, tags), location, employment type (several at once), experience level, remote only, minimum salary, exact tag, company, sorting by newest or salary, and pagination
- **Resume uploads** (`multer`): PDF, DOC or DOCX up to 5 MB, at most 5 per candidate. The file's **first bytes are checked**, so renaming `virus.exe` to `cv.pdf` doesn't work. Files are stored under random names. Only the candidate, employers who received the resume in an application, and admins can download it.
- **Applications**: apply with a resume and cover letter. You can only apply once per job; after withdrawing you can apply again. Closed jobs refuse applications.
- **Application tracking**: every status change is stored in a history (`applied → reviewing → interview → offered → hired / rejected`, or `withdrawn` by the candidate), so candidates can follow each step
- **Employer notifications**: employers are notified about new applications and withdrawals, and candidates about status changes. Notifications are stored in-app and can be marked as read; everything goes through a single `notify()` function, so email can be added in one place.
- **Admin panel and reports** (optional task item): user counts, open and closed jobs, applications by status, hire rate, applications over the last 7 days, most popular jobs, and a user list with activate/deactivate (deactivating logs the user out everywhere)
- **Security**: salted `scrypt` password hashes, bearer tokens stored as SHA-256 hashes, role checks on every endpoint, input validation, parameterized SQL
- **Frontend**: job search, job details and apply, candidate dashboard, employer dashboard, admin panel and notifications, in plain HTML/CSS/JS
- **Automated API tests**, including real multipart uploads

## Frontend

**Hirely** is a landing page that also works as the app, built for profile sign-ups.

- **Hero**: a benefit headline, a job search bar, and a sign-up card with an "I'm looking for a job / I'm hiring" switch (`POST /api/auth/register`).
- **Form states**: fields are validated in the browser; the button shows a spinner while the request runs; on success a welcome card replaces the form; server errors appear under the matching field.
- **Social proof**: live counts of open roles, companies hiring and remote-friendly jobs; the "Popular" chips are built from real job tags.
- **Page sections**: 3 outcome-focused benefits, 3 steps, a call-to-action band for employers, a FAQ accordion with 4 objections, and a closing call-to-action.
- **Job search**: a filter sidebar (type, level, salary, remote) and job rows with company initials and salary. Applying happens in a modal, and you can **upload a CV right there** by dragging and dropping it.
- **Candidate page** (`#/applications`): CV manager and a **progress timeline** for each application, with withdraw.
- **Employer page** (`#/listings`): pipeline stats, post/edit job modal, applicant list with CV download and a status menu that notifies the candidate.
- **Admin page** (`#/admin`), plus a **notification bell** that refreshes every 30 seconds.

## Tech stack

Node.js 22.13+ (tested on 24), Express 5, Multer 2, SQLite via the built-in `node:sqlite`, and plain HTML/CSS/JS.

## Getting started

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # auto-restart on changes
npm test         # API tests (in-memory DB + temp upload folder)
```

Demo data is created on first start: 2 companies, 5 jobs and these accounts:

| Role      | Email                | Password      |
|-----------|----------------------|---------------|
| Admin     | admin@jobs.com       | admin123      |
| Employer  | employer@jobs.com    | employer123   |
| Employer  | greensoft@jobs.com   | employer123   |
| Candidate | candidate@jobs.com   | candidate123  |

Environment variables: `PORT` (default `3000`), `DB_FILE` (default `data/jobs.db`), `UPLOAD_DIR` (default `uploads/`), `SEED=false`.

## API

Send the token from login or register as `Authorization: Bearer <token>`.

### Auth & profile
| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{ name, email, password, role: "candidate"\|"employer", companyName (employers), headline?, skills?, location? }` |
| POST | `/api/auth/login` | public | → `{ token, user }` |
| GET | `/api/auth/me` | any user | Includes `profile` |
| PUT | `/api/profile` | candidate / employer | Update name and profile |
| POST | `/api/auth/logout` | any user | |

### Jobs
| Method | Path | Who | Description |
|---|---|---|---|
| GET | `/api/jobs` | public | `?q=&location=&type=full_time,contract&experience=&remote=true&minSalary=&tag=&employerId=&sort=newest\|salary&page=&limit=` |
| GET | `/api/jobs/:id` | public | Owners also get application counts; candidates get `myApplication` |
| POST | `/api/jobs` | employer | `{ title, description, location, employmentType, experienceLevel?, isRemote?, salaryMin?, salaryMax?, tags? }` |
| PATCH | `/api/jobs/:id` | owner / admin | Partial update; `{ "status": "closed" }` closes it |
| DELETE | `/api/jobs/:id` | owner / admin | |
| GET | `/api/employer/jobs` | employer | Own listings with application counts by status |
| GET | `/api/companies/:id` | public | Company profile with open jobs |

### Resumes
| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/api/resumes` | candidate | `multipart/form-data`, field **`resume`** |
| GET | `/api/resumes` | candidate | My resumes |
| GET | `/api/resumes/:id/download` | owner, receiving employer, admin | File download |
| DELETE | `/api/resumes/:id` | owner | Refused if the resume was used in an application |

```bash
curl -X POST localhost:3000/api/resumes -H "Authorization: Bearer $TOKEN" -F "resume=@./my-cv.pdf"
```

### Applications
| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/api/jobs/:id/apply` | candidate | `{ resumeId, coverLetter? }` → notifies the employer |
| GET | `/api/applications` | candidate / employer | Candidates: their own; employers: all applications to their jobs (`?status=`) |
| GET | `/api/applications/:id` | involved users | With full `history` |
| GET | `/api/jobs/:id/applications` | owner / admin | Applicants for one job (`?status=`) |
| PATCH | `/api/applications/:id/status` | employer / admin | `{ status: reviewing\|interview\|offered\|hired\|rejected, note? }` → notifies the candidate |
| POST | `/api/applications/:id/withdraw` | candidate | → notifies the employer |

### Notifications
| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | `?unread=true&limit=` → `{ unreadCount, data }` |
| PATCH | `/api/notifications/:id/read` | Mark one as read |
| POST | `/api/notifications/read-all` | Mark all as read |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Users, jobs, applications by status, hire rate, last 7 days, top jobs |
| GET | `/api/admin/users` | `?role=&q=` |
| PATCH | `/api/admin/users/:id` | `{ isActive: false }` deactivates and logs out |

## Database schema

```
users (id, name, email, password_hash, role, is_active, created_at)
sessions (token_hash, user_id, expires_at)
employer_profiles (user_id, company_name, website, location, description)
candidate_profiles (user_id, headline, location, skills, bio)
jobs (id, employer_id, title, description, location, employment_type, experience_level,
      is_remote, salary_min, salary_max, tags, status, created_at, updated_at)
resumes (id, candidate_id, original_name, stored_name, mime_type, size, created_at)
applications (id, job_id, candidate_id, resume_id, cover_letter, status, created_at, updated_at,
              UNIQUE(job_id, candidate_id))
application_events (id, application_id, status, note, changed_by, created_at)
notifications (id, user_id, type, message, link, is_read, created_at)
```

## Project structure

```
src/
  server.js, app.js            # entry point and wiring
  db.js                        # schema, transactions, demo seed
  auth.js, validate.js, errors.js
  notifications.js             # notify() helper
  routes/  auth.js jobs.js resumes.js applications.js notifications.js admin.js
public/                        # frontend: index.html, css/base.css + css/app.css, js/ui.js + js/app.js
test/                          # API tests
uploads/                       # resume files (git-ignored)
```
