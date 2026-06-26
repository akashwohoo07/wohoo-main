import { Link } from "react-router-dom";

const GOOGLE_AUTH_URL = `${import.meta.env.VITE_API_URL}/api/auth/google?mode=login`;

export default function Login() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-violet-600 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-zinc-500 text-sm mt-1">Log in to your account</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
          <a
            href={GOOGLE_AUTH_URL}
            className="flex items-center justify-center gap-3 w-full bg-white hover:bg-zinc-100 text-zinc-900 font-semibold py-3 rounded-xl transition-all duration-150 text-sm shadow"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            Continue with Google
          </a>

          <p className="text-center text-zinc-600 text-xs mt-6">
            By continuing, you agree to our Terms of Service
          </p>
        </div>

        <p className="text-center text-zinc-500 text-sm mt-6">
          {"Don't have an account? "}
          <Link to="/signup" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>

      </div>
    </div>
  );
}