import { createLegacyApiClient } from './legacy-api-client.js';

// При переходе на ASP.NET Core страницы продолжают вызывать этот интерфейс.
export const platformApi = createLegacyApiClient({
  url: 'https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec',
  teacherCodeHash: 'b0a83a3919eba1d2a99034f2d94e5a47590f1710595c04bd64b5c8f21456a7c6'
});
