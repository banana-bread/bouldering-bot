require('dotenv').config()
const puppeteer = require('puppeteer')
const moment = require('moment')
moment().format()
const axios = require('axios')

const bot = { 
    browser: null,
    page: null,
    
    async init() {
        bot.browser = await puppeteer.launch({headless: false})
        bot.page = await bot.browser.newPage()
    },

    async goToSchedule() {
        await bot.page.goto(process.env.BASE_URL)

        const bookingServiceLink = await bot.page.evaluate(() => {
            const paragraphs = [...document.querySelectorAll('p')]
    
            const membersBlock = paragraphs.find(link => {
                const label = link.querySelector('strong').innerText
                
                if (!! label ) {
                    return label.trim().toLowerCase() === 'members & punchcard only'
                }
            })
    
            return membersBlock.querySelector('a').href
        })

        await bot.page.goto(bookingServiceLink)

        await bot.page.evaluate(() => {
            const buttons = [...document.querySelectorAll('a')]
    
            buttons.find(button => {
                const label = button.innerText
    
                if (!! button) {
                    return label.trim().toLowerCase().includes('week nights')
                }
            })
            .click()
        })

        const basementLink = await bot.page.evaluate(() => {
            const fieldsets = [...document.querySelectorAll('fieldset')]
    
            const basementLink = fieldsets.find(fieldset => {
                const label = fieldset.querySelector('legend').innerText
    
                if (!! label) {
                    return label.trim().toLowerCase().includes('gatineau main floor & basement')
                }
            })
    
            return basementLink.querySelector('a').href
        })
    
        await bot.page.goto(basementLink)
    },

    async selectDate(bookDate) {
        await bot.page.evaluate(bookDate => {
            // (1) find 'add member' button and click
            const rows = [...document.querySelectorAll('tr')]
            const memberRow = rows.find(row => {
                const dataCells = row.querySelectorAll('td')
    
                if (!! dataCells[1]) {
                    const labelDiv = dataCells[1].querySelector('div')
                    
                    if(!! labelDiv) {
                        const label = labelDiv.innerText
    
                        if (!! label) {
                            return label.trim().toLocaleLowerCase() === 'members'
                        }
                    }
                }
            })
    
            const addButton = [...memberRow.querySelectorAll('a')].find(button => {
                label = button.innerText
    
                if (!! label) {
                    return label.trim() === '+'
                }
            })
    
            addButton.click()
 
            // Get schedule table
            const getTableBody = () => {
                return [...document.querySelectorAll('tbody')].find(body => { 
                    return [...body.querySelectorAll('tr')].find(row => {
                        return [...row.childNodes].find(child => { 
                            const classList = child.classList
                            return !! classList && classList.toString().trim().includes('ui-datepicker')
                        })
                    })
                })
            }
        
            // Get booking dat cell from schedule table
            const getDateCell = () => {
                return [...getTableBody().querySelectorAll('td')].find(day => {
                    const dayAnchor = day.querySelector('a')
                    return !! dayAnchor && dayAnchor.innerText == bookDate
                })
            }

            // (2) find and click schedule date
                    if ( getDateCell() ) {
                        getDateCell().click()
                    } else {
                        document.querySelector('.ui-datepicker-next.ui-corner-all').click()
                        getDateCell().click()
                    }      
        }, bookDate)
    },

    async selectTime(bookTime) {
        await bot.page.evaluate(bookTime => {
            setTimeout(() => {
                const bookTimeRow = [...document.querySelectorAll('#containing-div-for-event-table > table tr')]
                                        .find(row => row.querySelector('td').textContent.includes(bookTime))

                bookTimeRow.querySelector('a.book-now-button').click()
            }, 3000)
        }, bookTime)

        await bot.page.waitForNavigation()
    },

    async inputBookingDetails(bookingDetails) {
        await bot.page.evaluate(bookingDetails => {
            const inputs = [...document.querySelectorAll('input')]
            const { firstName, lastName, memberId } = bookingDetails

            const getInputByPlacehodlder = placeholder => inputs.find(input => !! input.placeholder && input.placeholder.trim().toLowerCase() === placeholder)
            const getInputById = id => inputs.find(input => !!input.id && input.id === id)

            getInputByPlacehodlder('first name').value = firstName
            getInputByPlacehodlder('last name').value = lastName
            getInputById('p18e71bc0d3f7e4e729a8bcc4fb036c236').value = memberId

        }, bookingDetails)

        await bot.page.select(`[id*='month']`, bookingDetails.birthMonth)
        await bot.page.select(`[id*='day']`, bookingDetails.birthDay)
        await bot.page.select(`[id*='year']`, bookingDetails.birthYear)

        await bot.page.evaluate(() => document.querySelector('.btn.navforward').click())
        await bot.page.waitForNavigation()

        await bot.page.evaluate(bookingDetails => {
            const { email, phone } = bookingDetails

            document.querySelector('input#customer-email').value = email
            document.querySelector('input#customer-phone').value = phone
            const iAgreeCheck = [...document.querySelectorAll('input')].find(input => !!input.dataset.requiredCheckbox && input.dataset.requiredCheckbox == 1)
            iAgreeCheck.click()

        }, bookingDetails)
    },

    async solveCaptcha(solveCaptchaDetails) {
        const { siteKey, captchaApiKey, captchaUrl } = solveCaptchaDetails

        const response = await axios.get(`http://2captcha.com/in.php?key=${captchaApiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${captchaUrl}`)
        const captchaId = response.data.replace(/\D/g,'')

        setTimeout( async () => {
            const response = await axios.get(`http://2captcha.com/res.php?key=${captchaApiKey}&action=get&id=${captchaId}`)
            const captchaAnswer = response.data.slice(3)
            

            await bot.page.evaluate(captchaAnswer => {
               const confirmBookingButton =  document.querySelector('a#confirm_booking_button')
               const solveCaptchaTextArea = document.querySelector('textarea#g-recaptcha-response')
               solveCaptchaTextArea.value = captchaAnswer
            //    confirmBookingButton.click()
               console.log(solveCaptchaTextArea.value)
            }, captchaAnswer)

        }, 60000)

        // run chron job every monday, wednesday and sturday at noon: 0 12 * * 1,3,6
    }

}    


const doIt = async () => {
    const { 
        FIRST_NAME, 
        LAST_NAME, 
        EMAIL,
        PHONE, 
        BIRTH_MONTH, 
        BIRTH_YEAR, 
        BIRTH_DAY,
        MEMBER_ID,
        SITE_KEY,
        CAPTCHA_API_KEY,
        CAPTCHA_URL
    } = process.env

    const bookingDetails = {
        date: moment().add(3, 'd').toDate().getDate(),
        time: moment().day() === 3 ? '09:20' : '18:40',
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        email: EMAIL,
        phone: PHONE,
        birthMonth: BIRTH_MONTH,
        birthYear: BIRTH_YEAR,
        birthDay: BIRTH_DAY,
        memberId: MEMBER_ID
    }

    const solveCaptchaDetails = {
        siteKey: SITE_KEY,
        captchaApiKey: CAPTCHA_API_KEY,
        captchaUrl: CAPTCHA_URL
    }

    await bot.init()
    await bot.goToSchedule()
    await bot.selectDate(bookingDetails.date)
    await bot.selectTime(bookingDetails.time)
    await bot.inputBookingDetails(bookingDetails)
    await bot.solveCaptcha(solveCaptchaDetails)
}

doIt()
