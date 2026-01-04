# Internal Workflow & Access Control Platform

A **production-grade internal ticketing and workflow system** built with a strong focus on **backend-enforced workflows**, **JWT-based authentication**, and **role-based access control (RBAC)**.

This project is intentionally designed to demonstrate **real-world system design and backend engineering practices**, not just CRUD APIs.

---

## 🚀 Project Overview

The platform enables organizations to manage internal requests/tickets with a **strict workflow lifecycle**.  
All authorization and workflow rules are enforced on the **backend**, ensuring security and correctness regardless of frontend behavior.

The same frontend screens can be reused for different roles, while backend logic decides **what actions are allowed**.

---

## 🎯 Core Objectives

- Enforce **workflow transitions on the backend**
- Implement **stateless authentication** using JWT
- Apply **role-based access control (RBAC)**
- Maintain **clean separation of concerns**
- Keep the system **simple but production-ready**
- Ensure everything is **interview-explainable**

---

## 🧑‍💼 Roles & Responsibilities

| Role | Responsibilities |
|----|------------------|
| **User** | Create tickets, verify resolution |
| **Manager** | Assign tickets, close tickets |
| **Resolver** | Work on assigned tickets, mark them resolved |
| **Admin** | Manage users & roles (no workflow actions) |

---

## 🔄 Ticket Workflow

The ticket lifecycle follows a **strict backend-controlled state machine**:

