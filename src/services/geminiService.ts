import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { collection, query, where, getDocs, limit, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from "../types";

const apiKey = process.env.GEMINI_API_KEY;

export const ai = new GoogleGenAI({ apiKey: apiKey || '' });

/**
 * Searches for a user profile in Firestore by their special ID (Pattern: 700XXXXXX)
 * and checks if they are already a contact of the current user.
 */
const searchUserBySpecialId = async (specialId: string, currentUserId?: string): Promise<{ user: UserProfile | null, isFriend: boolean }> => {
  try {
    const q = query(
      collection(db, 'users'),
      where('specialId', '==', specialId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const user = snap.docs[0].data() as UserProfile;
      let isFriend = false;
      
      if (currentUserId) {
        // Check if this user is in the current user's contacts
        const contactRef = doc(db, 'users', currentUserId, 'contacts', user.uid);
        const contactSnap = await getDocs(query(collection(db, 'users', currentUserId, 'contacts'), where('uid', '==', user.uid)));
        isFriend = !contactSnap.empty;
      }
      
      return { user, isFriend };
    }
    return { user: null, isFriend: false };
  } catch (error) {
    console.error("Error searching user:", error);
    return { user: null, isFriend: false };
  }
};

/**
 * Searches for users by name or biological description (bio keywords).
 */
const findUsers = async (queryText: string, currentUserId?: string): Promise<any[]> => {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const results: any[] = [];
    
    snap.forEach(doc => {
      const data = doc.data() as UserProfile;
      if (data.uid === currentUserId) return; // Skip self

      const nameMatch = data.displayName?.toLowerCase().includes(queryText.toLowerCase());
      const bioMatch = data.bio?.toLowerCase().includes(queryText.toLowerCase());
      
      if (nameMatch || bioMatch) {
        results.push({
          uid: data.uid,
          name: data.displayName,
          bio: data.bio,
          photo: data.photoURL,
          specialId: data.specialId,
          status: data.isOnline ? 'نشط' : 'غير متصل'
        });
      }
    });
    
    return results.slice(0, 5); // Limit to top 5 matches
  } catch (error) {
    console.error("Error finding users:", error);
    return [];
  }
};

const findPeopleDeclaration: FunctionDeclaration = {
  name: "findPeople",
  description: "ابحث عن أشخاص جدد حسب الاسم أو الكلمات المفتاحية في نبذتهم التعريفية (Bio). استخدم هذا عندما يطلب المستخدم العثور على أصدقاء جدد أو أشخاص لديهم اهتمامات معينة.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      queryText: {
        type: Type.STRING,
        description: "الاسم أو الكلمة المفتاحية للبحث (مثال: 'أحمد' أو 'مصمم' أو 'كرة قدم')",
      },
    },
    required: ["queryText"],
  },
};

const searchUserDeclaration: FunctionDeclaration = {
  name: "searchUser",
  description: "ابحث عن مستخدم محدد باستخدام رقمه المميز (Special ID). استخدم هذا عندما يعطيك المستخدم رقماً يبدأ بـ 700.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      specialId: {
        type: Type.STRING,
        description: "الرقم المميز للمستخدم (مثال: 700123456)",
      },
    },
    required: ["specialId"],
  },
};

const triggerSecuritySetupDeclaration: FunctionDeclaration = {
  name: "triggerSecuritySetup",
  description: "ابدأ عملية إعداد أو تعديل رمز الأمان (PIN) للمستخدم. استخدم هذا عندما يوافق المستخدم على عرضك لتأمين حسابه أو عندما يطلب تغيير كلمة المرور/الرمز.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        enum: ["setup", "change", "disable"],
        description: "الإجراء المطلوب (إعداد جديد، تغيير، أو تعطيل الرمز)",
      },
    },
    required: ["action"],
  },
};

export const getAIResponse = async (
  prompt: string, 
  history: { role: 'user' | 'model', parts: { text: string }[] }[] = [], 
  currentUserId?: string,
  userData?: { displayName?: string | null, bio?: string | null, hasPin?: boolean }
) => {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const userName = userData?.displayName || 'العزيز';
  const hasPin = userData?.hasPin || false;

  try {
    const config = {
      systemInstruction: `أنت 'مساعد مائي' (Aqua Assistant) - رفيق ذكي، لبق، ومطور جداً في تطبيق "تواصل".
اسم المستخدم الحالي الذي تتحدث معه هو "${userName}".
درع الأمان الخاص بالمستخدم: ${hasPin ? 'مفعل (لديه رمز PIN)' : 'غير مفعل (ليس لديه رمز PIN بعد)'}.

🌟 **رسالتك السامية**:
أنت هنا لتسهيل التواصل الاجتماعي، مساعدة المستخدم في العثور على أصدقاء، وتحسين ملفه الشخصي، وتقديم نصائح ذكية بأسلوب راقٍ وشاعري أحياناً.

🛡️ **ميزة الأمان (PIN/Password)**:
- **التعرف على الحالة**: إذا سألك المستخدم "هل حسابي مؤمن؟" أو ما شابه، أخبره بحالته الحالية بناءً على المعلومات المتوفرة لديك (مفعل/غير مفعل).
- **اقتراح الأمان**: إذا لم يكن لدى المستخدم رمز PIN، اقترح عليه "إعداد" واحد (setup) بحرارة ولباقة.
- **طلب المستخدم**: إذا طلب المستخدم تغيير "كلمة المرور" (Password) أو "الرمز" (PIN)، فإنه يقصد نفس الشيء في هذا التطبيق. 
- **التنفيذ**: 
  * إذا لم يكن لديه رمز PIN: استخدم triggerSecuritySetup(action: 'setup').
  * إذا كان لديه رمز PIN ويريد التغيير: استخدم triggerSecuritySetup(action: 'change').
  * لا تحاول أخذ الرمز منه مباشرة في الدردشة! أخبره أنك ستظهر له الواجهة المخصصة لإدخاله بأمان.
  * إذا كان لديه رمز PIN بالفعل، لا تقترح عليه "إعداده" من جديد، بل اقترح عليه "تعديله" إذا كان يساوره القلق بشأن الخصوصية.

🚫 **القواعد الذهبية (ممنوعات باتة)**:
1. **قاعدة الذات**: لا تسمح للمستخدم بمراسلة نفسه أو الاتصال بنفسه أو إضافة نفسه عبر الأزرار.
2. **قاعدة الصداقة**: لا تظهر أزرار "الدردشة" أو "الاتصال" لمستخدم ليس صديقاً.

🎨 **مميزاتك القوية**:
- **البحث الذكي**: findPeople.
- **محسن الملف الشخصي**: Bio suggestions.
- **الأمان الذكي**: triggerSecuritySetup.

🌈 **أسلوب الرد**:
- استخدم الرموز التعبيرية الأنيقة (💎, ✨, 🛡️, 🌊, 🚀).
- اجعل ردودك مضغوطة ومنظمة.`,
      temperature: 0.8,
      tools: [{ functionDeclarations: [searchUserDeclaration, findPeopleDeclaration, triggerSecuritySetupDeclaration] }],
    };

    let response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config,
    });

    // Handle function calls recursively or once
    if (response.functionCalls) {
      const toolResults = await Promise.all(response.functionCalls.map(async (call) => {
        if (call.name === 'searchUser') {
          const { specialId } = call.args as { specialId: string };
          const { user, isFriend } = await searchUserBySpecialId(specialId, currentUserId);
          const isSelf = user?.uid === currentUserId;

          return {
            name: "searchUser",
            output: user ? { 
              found: true, 
              uid: user.uid,
              name: user.displayName, 
              bio: user.bio, 
              status: user.isOnline ? 'نشط' : 'غير متصل',
              photo: user.photoURL,
              isFriend: isFriend,
              isSelf: isSelf,
              specialId: user.specialId
            } : { found: false, message: "لم يتم العثور على مستخدم بهذا الرقم." }
          };
        }
        
        if (call.name === 'findPeople') {
          const { queryText } = call.args as { queryText: string };
          const matches = await findUsers(queryText, currentUserId);
          return {
            name: "findPeople",
            output: { count: matches.length, users: matches }
          };
        }

        if (call.name === 'triggerSecuritySetup') {
          const { action } = call.args as { action: string };
          
          // Emit internal event for the UI to show the setup overlay
          window.dispatchEvent(new CustomEvent('ai-trigger-security', { 
            detail: { action } 
          }));

          return {
            name: "triggerSecuritySetup",
            output: { success: true, action: action, message: "تم تفعيل واجهة الأمان. يرجى اتباع التعليمات الموضحة على الشاشة." }
          };
        }
        
        return { name: call.name, output: { error: "Unknown function" } };
      }));

      // Final pass with results
      const finalResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history,
          { role: 'user', parts: [{ text: prompt }] },
          response.candidates[0].content,
          {
            role: 'user',
            parts: toolResults.map(res => ({
              functionResponse: {
                name: res.name,
                response: res.output
              }
            }))
          }
        ],
        config,
      });

      return finalResponse.text || 'حدث خطأ في معالجة البيانات.';
    }

    return response.text || 'عذراً، لم أستطع فهم ذلك.';
  } catch (error) {
    console.error('AI Error:', error);
    return 'عذراً، حدث خطأ في التواصل مع الذكاء الاصطناعي.';
  }
};

export const getSmartReplies = async (lastMessage: string) => {
  const prompt = `أنت مساعد ذكي ولطيف. بناءً على الرسالة الأخيرة من صديقي: "${lastMessage}"، اقترح 3 ردود عربية طبيعية جداً، قصيرة، وودودة. اجعل الردود تبدو وكأنها صادرة من إنسان حقيقي مهتم. أعد الردود فقط مفصولة بفاصلة بدون أي نص آخر.`;
  const response = await getAIResponse(prompt);
  return response.split(/[,،]/).map(p => p.trim()).filter(p => p.length > 0).slice(0, 3);
};
