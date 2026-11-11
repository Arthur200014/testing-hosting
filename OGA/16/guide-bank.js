// ОГЭ №16. Каждый прототип возвращает условие, числовой ответ и вывод по шагам.
// Не зависим от Firebase: один и тот же результат передаётся всем участникам.
const ri=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
const pick=arr=>arr[ri(0,arr.length-1)];
const tens=(min,max)=>10*ri(min,max);
const degrees=n=>String(n)+'°';
export const PROTOTYPES=[
 {id:'central',title:'Центральный угол и дуга',rule:'Градусная мера дуги равна центральному углу, который на неё опирается.',figure:'central',make(){
   const a=tens(3,17);
   return {q:'Центральный угол AOB равен '+degrees(a)+'. Найдите градусную меру меньшей дуги AB.',answer:a,
   steps:['Центральный угол AOB опирается на дугу AB.','Мера дуги AB равна мере центрального угла: '+degrees(a)+'.','Ответ: '+degrees(a)+'.']};
 }},
 {id:'inscribed',title:'Вписанный угол по дуге',rule:'Вписанный угол равен половине дуги, на которую он опирается.',figure:'inscribed',make(){
   const v=ri(2,14)*10,ans=v/2;
   return {q:'Дуга AB, не содержащая точку C, равна '+degrees(v)+'. Найдите вписанный угол ACB.',answer:ans,
   steps:['Угол ACB — вписанный, он опирается на дугу AB.','Вписанный угол равен половине дуги: '+v+' : 2 = '+ans+'.','Ответ: '+degrees(ans)+'.']};
 }},
 {id:'arc',title:'Дуга по вписанному углу',rule:'Дуга, на которую опирается вписанный угол, вдвое больше угла.',figure:'inscribed',make(){
   const a=ri(2,15)*5,ans=2*a;
   return {q:'Вписанный угол ACB равен '+degrees(a)+'. Найдите меру дуги AB, не содержащей точку C.',answer:ans,
   steps:['Угол ACB опирается на дугу AB.','Дуга в два раза больше вписанного угла: 2 · '+a+' = '+ans+'.','Ответ: '+degrees(ans)+'.']};
 }},
 {id:'tangentChord',title:'Касательная и хорда',rule:'Угол между касательной и хордой равен половине заключённой между ними дуги.',figure:'tangent',make(){
   const arc=ri(3,16)*10,ans=arc/2;
   return {q:'Касательная в точке A образует с хордой AB острый угол. Заключённая между ними дуга AB равна '+degrees(arc)+'. Найдите этот угол.',answer:ans,
   steps:['Угол между касательной и хордой измеряется половиной заключённой дуги.','Делим '+degrees(arc)+' пополам: '+arc+' : 2 = '+ans+'.','Ответ: '+degrees(ans)+'.']};
 }},
 {id:'twoTangents',title:'Отрезки касательных',rule:'Отрезки касательных из одной внешней точки равны.',figure:'twoTangents',make(){
   const len=ri(5,40);
   return {q:'Из точки P к окружности проведены касательные PA и PB. Длина PA = '+len+'. Найдите PB.',answer:len,
   steps:['PA и PB — касательные из одной точки P.','По свойству касательных PA = PB.','Следовательно, PB = '+len+'.']};
 }},
 {id:'cyclic',title:'Вписанный четырёхугольник',rule:'Противоположные углы вписанного четырёхугольника в сумме дают 180°.',figure:'cyclic',make(){
   const a=ri(5,15)*10,ans=180-a;
   return {q:'Четырёхугольник ABCD вписан в окружность. Угол A = '+degrees(a)+'. Найдите угол C.',answer:ans,
   steps:['Углы A и C — противоположные во вписанном четырёхугольнике.','Их сумма 180°: ∠C = 180° − '+degrees(a)+'.','Ответ: '+degrees(ans)+'.']};
 }},
 {id:'chords',title:'Пересекающиеся хорды',rule:'Произведения отрезков двух пересекающихся хорд равны.',figure:'chords',make(){
   const [a,b,c]=pick([[3,4,2],[4,6,3],[6,8,4],[8,9,6],[9,12,6],[5,8,4],[6,10,5],[7,12,6],[9,8,4]]);
   const k=ri(1,3), x=a*k,y=b*k,z=c*k,ans=x*y/z;
   return {q:'Хорды AB и CD пересекаются в точке P. PA = '+x+', PB = '+y+', PC = '+z+'. Найдите PD.',answer:ans,
   steps:['Применяем теорему о пересекающихся хордах: PA · PB = PC · PD.','Подставляем: '+x+' · '+y+' = '+z+' · PD.','PD = '+(x*y)+' : '+z+' = '+ans+'.']};
 }},
 {id:'tangentSecant',title:'Касательная и секущая',rule:'Квадрат касательной равен произведению внешней части секущей на всю секущую.',figure:'tangentSecant',make(){
   const [t,x,w]=pick([[6,4,9],[8,4,16],[10,5,20],[12,9,16],[15,9,25],[18,12,27],[20,16,25],[12,6,24]]);
   const k=ri(1,3),t1=t*k,x1=x*k,w1=w*k,ans=w1-x1;
   return {q:'Из точки P проведены касательная PA = '+t1+' и секущая PBC, причём PB = '+x1+'. Найдите внутреннюю часть BC.',answer:ans,
   steps:['По теореме о касательной и секущей PA² = PB · PC.','PC = '+t1+'² : '+x1+' = '+w1+'.','BC = PC − PB = '+w1+' − '+x1+' = '+ans+'.']};
 }},
 {id:'twoSecants',title:'Две секущие',rule:'Произведения внешней части каждой секущей на её полную длину равны.',figure:'twoSecants',make(){
   const [a,b,c,d]=pick([[3,12,4,9],[5,12,6,10],[4,20,5,16],[6,15,5,18],[4,18,6,12],[7,12,6,14]]);
   const k=ri(1,3),x=a*k,w=b*k,z=c*k,ans=d*k;
   return {q:'Из точки P проведены две секущие PAB и PCD. PA = '+x+', PB = '+w+' (вся секущая), PC = '+z+'. Найдите PD (всю вторую секущую).',answer:ans,
   steps:['Для двух секущих PA · PB = PC · PD.','Подставляем: '+x+' · '+w+' = '+z+' · PD.','PD = '+(x*w)+' : '+z+' = '+ans+'.']};
 }},
 {id:'intersectionAngle',title:'Угол пересекающихся хорд',rule:'Угол внутри окружности равен полусумме двух дуг, которые он стягивает вместе с вертикальным.',figure:'intersectionAngle',make(){
   const a=ri(3,15)*10,b=ri(3,15)*10,ans=(a+b)/2;
   return {q:'Хорды AB и CD пересекаются в точке P. Дуги AC и BD равны '+degrees(a)+' и '+degrees(b)+'. Найдите угол APC.',answer:ans,
   steps:['Угол APC находится внутри окружности между двумя хордами.','Берём полусумму дуг AC и BD: ('+a+' + '+b+') : 2.','Ответ: '+degrees(ans)+'.']};
 }},
 {id:'outsideAngle',title:'Угол двух секущих',rule:'Угол между двумя секущими из внешней точки равен полуразности большей и меньшей дуг.',figure:'outsideAngle',make(){
   const big=ri(14,24)*10,small=ri(3,11)*10,ans=(big-small)/2;
   return {q:'Из внешней точки P проведены две секущие. Большая дуга между дальними точками пересечения равна '+degrees(big)+', меньшая между ближними — '+degrees(small)+'. Найдите угол между секущими.',answer:ans,
   steps:['Угол при внешней точке равен половине разности соответствующих дуг.','Вычитаем меньшую дугу из большей: '+big+' − '+small+' = '+(big-small)+'.','Делим на 2: '+(big-small)+' : 2 = '+ans+'°.']};
 }},
 {id:'chordDistance',title:'Хорда и расстояние от центра',rule:'Перпендикуляр из центра к хорде делит её пополам; затем используется теорема Пифагора.',figure:'chordDistance',make(){
   const [a,b,r]=pick([[3,4,5],[5,12,13],[8,15,17],[7,24,25]]);
   const k=ri(1,3),d=a*k,R=r*k,half=b*k,ans=half*2;
   return {q:'Радиус окружности равен '+R+', расстояние от центра O до хорды AB равно '+d+'. Найдите длину хорды AB.',answer:ans,
   steps:['Опустим перпендикуляр OM на хорду AB. Он делит хорду пополам.','По Пифагору AM = √(OA² − OM²) = √('+R+'² − '+d+'²) = '+half+'.','AB = 2 · AM = '+ans+'.']};
 }}
];
export const shuffle=array=>{const a=array.slice();for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
export const getPrototype=id=>PROTOTYPES.find(p=>p.id===id)||PROTOTYPES[0];
export function makePair(id){
 const g=getPrototype(id),a=g.make();let b=g.make(),attempts=0;
 while((a.q===b.q||a.answer===b.answer)&&attempts++<90)b=g.make();
 // На крайний случай условия все равно должны различаться.
 if(a.q===b.q)b=g.make();
 return {a:{...a,proto:id,nonce:randomId()},b:{...b,proto:id,nonce:randomId()}};
}
export const randomId=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'q'+Date.now()+Math.random().toString(36).slice(2);
